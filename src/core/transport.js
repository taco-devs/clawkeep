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
    throw new Error('S3 backup is not yet implemented');
  }
  throw new Error('Unknown target: ' + target);
}

module.exports = { BackupTransport, LocalTransport, GitTransport, createTransport };
