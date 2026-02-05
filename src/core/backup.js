'use strict';

const path = require('path');
const fs = require('fs');

/**
 * BackupManager — handles syncing version history to backup targets.
 * Targets: local path (mirror), cloud (stub), s3 (v2), git (legacy).
 */
class BackupManager {
  constructor(clawGit) {
    this.claw = clawGit;
    this.dir = clawGit.dir;
  }

  /** Get current backup config + status */
  getConfig() {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target || null;

    let targetLabel = 'Not configured';
    if (target === 'local' && backup.local?.path) {
      targetLabel = backup.local.path;
    } else if (target === 'cloud') {
      targetLabel = 'ClawKeep Cloud';
    } else if (target === 's3' && backup.s3?.bucket) {
      targetLabel = `s3://${backup.s3.bucket}/${backup.s3.prefix || ''}`;
    } else if (target === 'git') {
      targetLabel = config.remote || 'git remote';
    }

    return {
      target,
      targetLabel,
      autoSync: backup.autoSync || false,
      lastSync: backup.lastSync || null,
      local: backup.local || null,
      cloud: backup.cloud || null,
      s3: backup.s3 || null,
    };
  }

  /** Set backup target */
  async setTarget(type, options = {}) {
    const config = this.claw.loadConfig();
    if (!config.backup) {
      config.backup = {
        target: null,
        local: { path: null },
        cloud: { token: null, endpoint: 'https://api.clawkeep.com' },
        s3: { bucket: null, prefix: null, region: null },
        autoSync: true,
        lastSync: null,
      };
    }

    config.backup.target = type;

    if (type === 'local' && options.path) {
      const absPath = path.resolve(options.path);
      config.backup.local = { path: absPath };
      // Init bare mirror if it doesn't exist
      await this._initLocalMirror(absPath);
    } else if (type === 'git' && options.url) {
      config.remote = options.url;
      await this.claw.setRemote(options.url);
    } else if (type === 's3') {
      config.backup.s3 = {
        bucket: options.bucket || null,
        prefix: options.prefix || null,
        region: options.region || null,
      };
    }

    this.claw.saveConfig(config);
    return this.getConfig();
  }

  /** Sync to backup target (push) */
  async sync() {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target;

    if (!target) throw new Error('No backup target configured');

    let result;
    if (target === 'local') {
      result = await this._syncLocal(backup.local.path);
    } else if (target === 'git') {
      await this.claw.push();
      result = { ok: true, target: 'git' };
    } else if (target === 'cloud') {
      throw new Error('ClawKeep Cloud is coming soon');
    } else if (target === 's3') {
      throw new Error('S3 backup is not yet implemented');
    }

    // Update lastSync
    config.backup.lastSync = new Date().toISOString();
    this.claw.saveConfig(config);

    return { ...result, lastSync: config.backup.lastSync };
  }

  /** Pull from backup target */
  async pull() {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target;

    if (!target) throw new Error('No backup target configured');

    if (target === 'local') {
      await this.claw.git.fetch(backup.local.path, 'main');
      return { ok: true };
    } else if (target === 'git') {
      await this.claw.pull();
      return { ok: true };
    }

    throw new Error(`Pull not supported for target: ${target}`);
  }

  /** Test connection to backup target */
  async test() {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target;

    if (!target) return { ok: false, message: 'No backup target configured' };

    const start = Date.now();

    if (target === 'local') {
      const localPath = backup.local?.path;
      if (!localPath) return { ok: false, message: 'No local path configured' };
      if (!fs.existsSync(localPath)) return { ok: false, message: 'Path does not exist: ' + localPath };
      // Check if it's a valid bare repo
      const headPath = path.join(localPath, 'HEAD');
      if (!fs.existsSync(headPath)) return { ok: false, message: 'Not a valid backup mirror at: ' + localPath };
      return { ok: true, message: 'Connected', latencyMs: Date.now() - start };
    } else if (target === 'git') {
      try {
        await this.claw.git.listRemote(['--heads', 'origin']);
        return { ok: true, message: 'Connected', latencyMs: Date.now() - start };
      } catch (e) {
        return { ok: false, message: 'Remote unreachable: ' + e.message };
      }
    } else if (target === 'cloud') {
      return { ok: false, message: 'ClawKeep Cloud is coming soon' };
    } else if (target === 's3') {
      return { ok: false, message: 'S3 backup not yet implemented' };
    }

    return { ok: false, message: 'Unknown target: ' + target };
  }

  /** Initialize a bare mirror at a local path */
  async _initLocalMirror(localPath) {
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }

    const headPath = path.join(localPath, 'HEAD');
    if (!fs.existsSync(headPath)) {
      // Clone as bare mirror
      const simpleGit = require('simple-git');
      await simpleGit().clone(this.dir, localPath, ['--bare', '--mirror']);
    }
  }

  /** Sync to local bare mirror */
  async _syncLocal(localPath) {
    if (!localPath) throw new Error('No local path configured');
    if (!fs.existsSync(localPath)) {
      await this._initLocalMirror(localPath);
    }
    await this.claw.git.push(localPath, '--all', ['--force']);
    return { ok: true, target: 'local' };
  }
}

module.exports = BackupManager;
