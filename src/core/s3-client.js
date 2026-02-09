'use strict';

const crypto = require('crypto');
const https = require('https');
const http = require('http');

const EMPTY_HASH = crypto.createHash('sha256').update('').digest('hex');

/**
 * Lightweight S3 client with AWS Signature V4 signing.
 * Zero external dependencies — uses Node.js built-in crypto + https.
 * Works with: Cloudflare R2, AWS S3, Backblaze B2, MinIO, Wasabi.
 */
class S3Client {
  constructor({ endpoint, bucket, region, accessKey, secretKey }) {
    this.endpoint = endpoint.replace(/\/$/, '');
    this.bucket = bucket;
    this.region = region || 'auto';
    this.accessKey = accessKey;
    this.secretKey = secretKey;

    const url = new URL(this.endpoint);
    this.host = url.host;
    this.isHttps = url.protocol === 'https:';
  }

  // --- AWS Signature V4 ---

  _sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  _hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  _signingKey(dateStamp) {
    const kDate = this._hmac('AWS4' + this.secretKey, dateStamp);
    const kRegion = this._hmac(kDate, this.region);
    const kService = this._hmac(kRegion, 's3');
    return this._hmac(kService, 'aws4_request');
  }

  _encodePath(p) {
    return p.split('/').map(s => encodeURIComponent(s)).join('/');
  }

  _sign(method, objectPath, query, headers, payloadHash) {
    const now = new Date();
    const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
    const amzDate = dateStamp + 'T' +
      now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';

    headers['x-amz-date'] = amzDate;
    headers['x-amz-content-sha256'] = payloadHash;

    // Sort headers by lowercase name
    const sorted = Object.keys(headers)
      .map(k => [k.toLowerCase(), headers[k]])
      .sort(([a], [b]) => a.localeCompare(b));

    const signedHeaders = sorted.map(([k]) => k).join(';');
    const canonicalHeaders = sorted
      .map(([k, v]) => k + ':' + String(v).trim())
      .join('\n') + '\n';

    // Query string (sorted by key)
    let canonicalQuery = '';
    if (query && Object.keys(query).length > 0) {
      canonicalQuery = Object.entries(query)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');
    }

    const canonicalRequest = [
      method,
      this._encodePath(objectPath),
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const scope = dateStamp + '/' + this.region + '/s3/aws4_request';
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      this._sha256(canonicalRequest),
    ].join('\n');

    const signature = this._hmac(this._signingKey(dateStamp), stringToSign)
      .toString('hex');

    headers['authorization'] =
      'AWS4-HMAC-SHA256 Credential=' + this.accessKey + '/' + scope +
      ', SignedHeaders=' + signedHeaders +
      ', Signature=' + signature;

    return canonicalQuery;
  }

  // --- HTTP ---

  async _request(method, key, opts = {}) {
    const { query, body, headers: extra, retries = 3 } = opts;

    const objectPath = key
      ? '/' + this.bucket + '/' + key
      : '/' + this.bucket;

    const payloadHash = body ? this._sha256(body) : EMPTY_HASH;

    const headers = { host: this.host, ...(extra || {}) };
    if (body) {
      headers['content-length'] = String(Buffer.byteLength(body));
    }

    const canonicalQuery = this._sign(method, objectPath, query, headers, payloadHash);
    const urlStr = this.endpoint + objectPath +
      (canonicalQuery ? '?' + canonicalQuery : '');

    let lastError;
    for (let attempt = 0; attempt < retries; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 500));
      }
      try {
        const result = await this._doRequest(method, urlStr, headers, body);
        if (result.statusCode >= 500 || result.statusCode === 429) {
          lastError = new Error(`S3 ${method} ${key || '/'}: HTTP ${result.statusCode}`);
          continue;
        }
        return result;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  _doRequest(method, url, headers, body) {
    return new Promise((resolve, reject) => {
      const mod = this.isHttps ? https : http;
      const req = mod.request(url, { method, headers }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      });
      req.on('error', reject);
      req.setTimeout(60000, () => req.destroy(new Error('Request timeout')));
      if (body) req.write(body);
      req.end();
    });
  }

  // --- S3 Operations ---

  async putObject(key, body, contentType = 'application/octet-stream') {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
    const res = await this._request('PUT', key, {
      body: buf,
      headers: { 'content-type': contentType },
    });
    if (res.statusCode >= 300) throw this._error('PUT', key, res);
    return { etag: res.headers['etag'] };
  }

  async getObject(key) {
    const res = await this._request('GET', key);
    if (res.statusCode >= 300) throw this._error('GET', key, res);
    return res.body;
  }

  async headObject(key) {
    const res = await this._request('HEAD', key, { retries: 1 });
    if (res.statusCode === 404) return null;
    if (res.statusCode >= 300) throw this._error('HEAD', key, res);
    return {
      size: parseInt(res.headers['content-length']) || 0,
      lastModified: res.headers['last-modified'],
      etag: res.headers['etag'],
    };
  }

  async listObjects(prefix) {
    const res = await this._request('GET', '', {
      query: { 'list-type': '2', prefix: prefix || '' },
    });
    if (res.statusCode >= 300) throw this._error('LIST', prefix || '/', res);
    return this._parseList(res.body.toString('utf8'));
  }

  async deleteObject(key) {
    const res = await this._request('DELETE', key);
    if (res.statusCode >= 300 && res.statusCode !== 404) {
      throw this._error('DELETE', key, res);
    }
  }

  // --- Helpers ---

  _error(op, key, res) {
    const body = res.body ? res.body.toString('utf8') : '';
    const code = (body.match(/<Code>(.*?)<\/Code>/) || [])[1] || '';
    const message = (body.match(/<Message>(.*?)<\/Message>/) || [])[1] || '';
    const detail = code ? `${code}: ${message}` : `HTTP ${res.statusCode}`;
    return new Error(`S3 ${op} ${key || '/'} failed \u2014 ${detail}`);
  }

  _parseList(xml) {
    const objects = [];
    const re = /<Contents>([\s\S]*?)<\/Contents>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const c = m[1];
      objects.push({
        Key: (c.match(/<Key>(.*?)<\/Key>/) || [])[1] || '',
        Size: parseInt((c.match(/<Size>(.*?)<\/Size>/) || [])[1] || '0'),
        LastModified: (c.match(/<LastModified>(.*?)<\/LastModified>/) || [])[1] || '',
      });
    }
    return objects;
  }
}

module.exports = S3Client;
