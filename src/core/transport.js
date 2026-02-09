'use strict';

const fs = require('fs');
const path = require('path');

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
    throw new Error('ClawKeep Cloud is coming soon');
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

module.exports = { BackupTransport, LocalTransport, S3Transport, GitTransport, createTransport };
