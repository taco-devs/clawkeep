'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('./sync-crypto');
const { createTransport, LocalTransport } = require('./transport');
const SyncManager = require('./sync');

/**
 * BackupManager — handles syncing version history to backup targets.
 * Supports encrypted incremental chunk-based sync (local) and native git push.
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
      passwordSet: !!backup.passwordHash,
      workspaceId: backup.workspaceId || null,
      chunkCount: backup.chunkCount || 0,
      lastSyncCommit: backup.lastSyncCommit || null,
    };
  }

  /** Set encryption password (stores hash only) */
  setPassword(password) {
    if (!password) throw new Error('Password is required');
    const config = this.claw.loadConfig();
    if (!config.backup) config.backup = {};
    config.backup.passwordHash = hashPassword(password);
    this.claw.saveConfig(config);
  }

  /** Check if password is set */
  hasPassword() {
    const config = this.claw.loadConfig();
    return !!(config.backup?.passwordHash);
  }

  /** Verify a password against stored hash */
  checkPassword(password) {
    const config = this.claw.loadConfig();
    const hash = config.backup?.passwordHash;
    if (!hash) return false;
    return verifyPassword(password, hash);
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
      // Ensure directory exists
      if (!fs.existsSync(absPath)) {
        fs.mkdirSync(absPath, { recursive: true });
      }
      // Generate workspace ID if not set
      if (!config.backup.workspaceId) {
        const dirname = path.basename(this.dir);
        const suffix = crypto.randomBytes(4).toString('hex');
        config.backup.workspaceId = dirname + '-' + suffix;
      }
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

  /** Sync to backup target */
  async sync(password) {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target;

    if (!target) throw new Error('No backup target configured');

    let result;
    if (target === 'local') {
      // Encrypted incremental sync
      if (!password) throw new Error('Password required for encrypted sync');
      const transport = createTransport(backup, this.claw);
      const sm = new SyncManager(this.claw, transport, password);
      result = await sm.sync();
    } else if (target === 'git') {
      await this.claw.push();
      result = { ok: true, target: 'git', synced: true };
    } else if (target === 'cloud') {
      throw new Error('ClawKeep Cloud is coming soon');
    } else if (target === 's3') {
      throw new Error('S3 backup is not yet implemented');
    }

    // Reload config (SyncManager may have saved changes)
    const freshConfig = this.claw.loadConfig();
    freshConfig.backup.lastSync = new Date().toISOString();
    this.claw.saveConfig(freshConfig);

    return { ...result, lastSync: freshConfig.backup.lastSync };
  }

  /** Pull from backup target */
  async pull() {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    const target = backup.target;

    if (!target) throw new Error('No backup target configured');

    if (target === 'git') {
      await this.claw.pull();
      return { ok: true };
    }

    throw new Error(`Pull not supported for target: ${target} (use 'backup restore' instead)`);
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
      // Check writable
      try {
        const testFile = path.join(localPath, '.clawkeep-test-' + Date.now());
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
      } catch {
        return { ok: false, message: 'Path is not writable: ' + localPath };
      }
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

  /** Compact chunks into single full bundle */
  async compact(password) {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    if (backup.target !== 'local') throw new Error('Compact only supported for local target');
    if (!password) throw new Error('Password required for compact');

    const transport = createTransport(backup, this.claw);
    const sm = new SyncManager(this.claw, transport, password);
    return await sm.compact();
  }

  /** Get sync status (chunk count, sizes, etc.) */
  async getSyncStatus(password) {
    const config = this.claw.loadConfig();
    const backup = config.backup || {};
    if (backup.target !== 'local' || !password) {
      return {
        synced: false,
        chunkCount: backup.chunkCount || 0,
        lastSync: backup.lastSync || null,
      };
    }

    try {
      const transport = createTransport(backup, this.claw);
      const sm = new SyncManager(this.claw, transport, password);
      return await sm.getStatus();
    } catch {
      return {
        synced: false,
        chunkCount: backup.chunkCount || 0,
        lastSync: backup.lastSync || null,
      };
    }
  }

  /**
   * Restore from an encrypted backup directory.
   * @param {string} sourcePath - Path to the workspace backup dir (contains manifest.enc + chunks)
   * @param {string} destDir - Where to restore
   * @param {string} password - Decryption password
   */
  static async restoreFromBackup(sourcePath, destDir, password) {
    if (!password) throw new Error('Password required for restore');
    sourcePath = path.resolve(sourcePath);
    if (!fs.existsSync(sourcePath)) throw new Error('Backup path does not exist: ' + sourcePath);

    // Determine workspace ID from directory name
    const workspaceId = path.basename(sourcePath);
    const parentDir = path.dirname(sourcePath);
    const transport = new LocalTransport(parentDir);

    return await SyncManager.restoreFrom(transport, workspaceId, password, destDir);
  }
}

module.exports = BackupManager;
