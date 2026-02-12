'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

/**
 * Base transport interface for backup targets.
 * Each target type (local, S3, cloud) implements these methods.
 */
class BackupTransport {
  async writeFile(remotePath, buffer) { throw new Error('Not implemented'); }
  async readFile(remotePath) { throw new Error('Not implemented'); }
  async deleteFile(remotePath) { throw new Error('Not implemented'); }
  async listFiles(remoteDir) { throw new Error('Not implemented'); }
  async exists(remotePath) { throw new Error('Not implemented'); }
}

/**
 * Local filesystem transport.
 * Works with any mounted path: NAS, USB drive, NFS, SMB.
 */
class LocalTransport extends BackupTransport {
  constructor(basePath) {
    super();
    this.basePath = path.resolve(basePath);
  }

  async writeFile(remotePath, buffer) {
    const full = path.join(this.basePath, remotePath);
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(full, buffer);
  }

  async readFile(remotePath) {
    const full = path.join(this.basePath, remotePath);
    return fs.readFileSync(full);
  }

  async deleteFile(remotePath) {
    const full = path.join(this.basePath, remotePath);
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
    }
  }

  async listFiles(remoteDir) {
    const full = path.join(this.basePath, remoteDir);
    if (!fs.existsSync(full)) return [];
    return fs.readdirSync(full).filter(f => {
      return fs.statSync(path.join(full, f)).isFile();
    });
  }

  async exists(remotePath) {
    return fs.existsSync(path.join(this.basePath, remotePath));
  }
}

/**
 * S3 transport — works with any S3-compatible service.
 * Cloudflare R2, AWS S3, Backblaze B2, MinIO, Wasabi.
 */
class S3Transport extends BackupTransport {
  constructor(s3Client, prefix) {
    super();
    this.s3 = s3Client;
    this.prefix = prefix || '';
  }

  async writeFile(remotePath, buffer) {
    await this.s3.putObject(this.prefix + remotePath, buffer);
  }

  async readFile(remotePath) {
    return await this.s3.getObject(this.prefix + remotePath);
  }

  async deleteFile(remotePath) {
    await this.s3.deleteObject(this.prefix + remotePath);
  }

  async listFiles(remoteDir) {
    const prefix = this.prefix + remoteDir + (remoteDir.endsWith('/') ? '' : '/');
    const objects = await this.s3.listObjects(prefix);
    return objects
      .map(obj => {
        const key = obj.Key;
        return key.startsWith(prefix) ? key.slice(prefix.length) : key;
      })
      .filter(f => f && !f.includes('/'));
  }

  async exists(remotePath) {
    const head = await this.s3.headObject(this.prefix + remotePath);
    return head !== null;
  }
}

/**
 * Cloud transport — wraps S3Transport with auto-fetched R2 credentials.
 * Credentials are fetched from the ClawKeep Cloud API and cached until near-expiry.
 */
class CloudTransport extends BackupTransport {
  constructor({ apiKey, workspace, endpoint }) {
    super();
    this.apiKey = apiKey;
    this.workspace = workspace;
    this.endpoint = (endpoint || 'https://api.clawkeep.com').replace(/\/$/, '');
    this._inner = null;
    this._credsExpiry = 0;
  }

  async _fetchCredentials() {
    const url = `${this.endpoint}/api/workspaces/${this.workspace}/credentials`;
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.request(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + this.apiKey,
          'Accept': 'application/json',
        },
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            let msg = `Cloud API error: HTTP ${res.statusCode}`;
            try { msg = JSON.parse(body).error?.message || msg; } catch {}
            reject(new Error(msg));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error('Invalid JSON from cloud API'));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(30000, () => req.destroy(new Error('Cloud API request timeout')));
      req.end();
    });
  }

  async _ensureCredentials() {
    // Refresh if no inner transport or within 1 hour of expiry
    const now = Date.now();
    if (this._inner && this._credsExpiry - now > 3600000) return;

    const data = await this._fetchCredentials();
    const creds = data.credentials || data;

    const S3Client = require('./s3-client');
    const s3 = new S3Client({
      endpoint: creds.endpoint,
      bucket: creds.bucket,
      region: creds.region || 'auto',
      accessKey: creds.access_key_id,
      secretKey: creds.secret_access_key,
    });
    // API returns prefix like "workspaces/ws_xxx/" which is the R2 base path.
    // SyncManager already prepends workspaceId to all paths (e.g. "ws_xxx/manifest.enc"),
    // so we use the API prefix minus the trailing workspaceId to avoid doubling.
    let prefix = creds.prefix || '';
    const wsSuffix = this.workspace + '/';
    if (prefix.endsWith(wsSuffix)) {
      prefix = prefix.slice(0, -wsSuffix.length);
    }
    this._inner = new S3Transport(s3, prefix);
    const expiresAt = creds.expires_at || data.expires_at;
    this._credsExpiry = expiresAt
      ? new Date(expiresAt).getTime()
      : now + 3600000;
  }

  /**
   * Notify the cloud API that a sync occurred (fire-and-forget).
   * The API reads actual stats from R2 — we just ping it.
   */
  async reportSync() {
    const url = `${this.endpoint}/api/workspaces/${this.workspace}/sync-report`;
    try {
      await new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const mod = parsed.protocol === 'https:' ? https : http;
        const req = mod.request(url, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }, (res) => {
          res.resume(); // drain response
          res.on('end', resolve);
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('Sync report timeout')));
        req.end('{}');
      });
    } catch {
      // Fire-and-forget: don't fail the sync if report fails
    }
  }

  async writeFile(remotePath, buffer) {
    await this._ensureCredentials();
    return this._inner.writeFile(remotePath, buffer);
  }

  async readFile(remotePath) {
    await this._ensureCredentials();
    return this._inner.readFile(remotePath);
  }

  async deleteFile(remotePath) {
    await this._ensureCredentials();
    return this._inner.deleteFile(remotePath);
  }

  async listFiles(remoteDir) {
    await this._ensureCredentials();
    return this._inner.listFiles(remoteDir);
  }

  async exists(remotePath) {
    await this._ensureCredentials();
    return this._inner.exists(remotePath);
  }
}

/**
 * Git remote transport — uses native git push/pull.
 * No chunks needed; git handles incremental natively.
 */
class GitTransport extends BackupTransport {
  constructor(clawGit) {
    super();
    this.claw = clawGit;
  }

  async sync() {
    await this.claw.push();
  }

  async pull() {
    await this.claw.pull();
  }
}

/**
 * Factory: create the right transport for a backup config.
 */
function createTransport(backupConfig, clawGit) {
  const target = backupConfig.target;
  if (target === 'local') {
    if (!backupConfig.local?.path) throw new Error('No local path configured');
    return new LocalTransport(backupConfig.local.path);
  }
  if (target === 'git') {
    return new GitTransport(clawGit);
  }
  if (target === 'cloud') {
    const { loadCredentials } = require('./credentials');
    const creds = loadCredentials();
    const apiKey = process.env.CLAWKEEP_API_KEY || creds?.apiKey;
    const endpoint = backupConfig.cloud?.endpoint || creds?.endpoint || 'https://api.clawkeep.com';
    const workspace = backupConfig.workspaceId;
    if (!apiKey) throw new Error('No API key found. Run `clawkeep cloud setup` or set CLAWKEEP_API_KEY');
    if (!workspace) throw new Error('No workspace configured. Run `clawkeep cloud setup`');
    return new CloudTransport({ apiKey, workspace, endpoint });
  }
  if (target === 's3') {
    const s3Config = backupConfig.s3;
    if (!s3Config) throw new Error('No S3 config found');
    const S3Client = require('./s3-client');
    const s3 = new S3Client({
      endpoint: s3Config.endpoint,
      bucket: s3Config.bucket,
      region: s3Config.region || 'auto',
      accessKey: s3Config.accessKey || process.env.CLAWKEEP_S3_ACCESS_KEY,
      secretKey: s3Config.secretKey || process.env.CLAWKEEP_S3_SECRET_KEY,
    });
    return new S3Transport(s3, s3Config.prefix || '');
  }
  throw new Error('Unknown target: ' + target);
}

module.exports = { BackupTransport, LocalTransport, S3Transport, CloudTransport, GitTransport, createTransport };
