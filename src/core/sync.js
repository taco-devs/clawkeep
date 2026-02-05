'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { encryptChunk, decryptChunk } = require('./sync-crypto');

/**
 * SyncManager — manages encrypted incremental chunk-based sync.
 *
 * Handles manifest management, git bundle creation, incremental logic,
 * restore from backup, and compaction.
 */
class SyncManager {
  constructor(clawGit, transport, password) {
    this.claw = clawGit;
    this.transport = transport;
    this.password = password;
  }

  /**
   * Get or generate workspace ID.
   * Format: <dirname>-<random8hex>
   */
  _getWorkspaceId() {
    const config = this.claw.loadConfig();
    if (config.backup?.workspaceId) return config.backup.workspaceId;

    const dirname = path.basename(this.claw.dir);
    const suffix = crypto.randomBytes(4).toString('hex');
    const workspaceId = dirname + '-' + suffix;

    if (!config.backup) config.backup = {};
    config.backup.workspaceId = workspaceId;
    this.claw.saveConfig(config);
    return workspaceId;
  }

  /**
   * Pad chunk number to 6 digits.
   */
  _chunkName(num) {
    return 'chunk-' + String(num).padStart(6, '0') + '.enc';
  }

  /**
   * Read and decrypt manifest from remote. Returns null if not found.
   */
  async _readManifest(workspaceId) {
    const manifestPath = workspaceId + '/manifest.enc';
    const exists = await this.transport.exists(manifestPath);
    if (!exists) return null;

    const encData = await this.transport.readFile(manifestPath);
    const data = decryptChunk(encData, this.password);
    return JSON.parse(data.toString('utf8'));
  }

  /**
   * Encrypt and write manifest to remote.
   */
  async _writeManifest(workspaceId, manifest) {
    const data = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
    const encrypted = encryptChunk(data, this.password);
    await this.transport.writeFile(workspaceId + '/manifest.enc', encrypted);
  }

  /**
   * Get current HEAD commit hash.
   */
  async _getHead() {
    try {
      const hash = await this.claw.git.revparse(['HEAD']);
      return hash.trim();
    } catch {
      return null;
    }
  }

  /**
   * Check if there are commits between two refs.
   */
  async _hasNewCommits(fromCommit) {
    try {
      const log = await this.claw.git.raw(['log', '--oneline', fromCommit + '..HEAD']);
      return log.trim().length > 0;
    } catch {
      return true; // assume yes if check fails
    }
  }

  /**
   * Count commits in a range.
   */
  async _countCommits(fromCommit, toCommit) {
    try {
      const range = fromCommit ? fromCommit + '..' + toCommit : toCommit;
      const log = await this.claw.git.raw(['rev-list', '--count', range]);
      return parseInt(log.trim()) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Create a git bundle file. Returns the buffer.
   * @param {string|null} fromCommit - Base commit (null for full bundle)
   */
  async _createBundle(fromCommit) {
    const tmpDir = os.tmpdir();
    const tmpFile = path.join(tmpDir, 'clawkeep-bundle-' + Date.now() + '.bundle');

    try {
      if (fromCommit) {
        // Incremental: main ref, only commits after fromCommit
        await this.claw.git.raw(['bundle', 'create', tmpFile, 'main', '^' + fromCommit]);
      } else {
        // Full: entire history
        await this.claw.git.raw(['bundle', 'create', tmpFile, '--all']);
      }
      return fs.readFileSync(tmpFile);
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  }

  /**
   * Sync to backup target. Creates full or incremental bundle.
   * Returns { synced, chunkCount, totalSize }.
   */
  async sync() {
    const workspaceId = this._getWorkspaceId();
    const headCommit = await this._getHead();
    if (!headCommit) throw new Error('No commits to sync');

    const config = this.claw.loadConfig();
    const lastSyncCommit = config.backup?.lastSyncCommit || null;

    // Check if already synced
    if (lastSyncCommit && lastSyncCommit === headCommit) {
      return { synced: false, message: 'Already up to date' };
    }

    // Check for new commits
    if (lastSyncCommit) {
      const hasNew = await this._hasNewCommits(lastSyncCommit);
      if (!hasNew) {
        return { synced: false, message: 'Already up to date' };
      }
    }

    // Read existing manifest or create new one
    let manifest = await this._readManifest(workspaceId);
    const isFirstSync = !manifest;

    if (isFirstSync) {
      manifest = {
        version: 1,
        workspaceId,
        createdAt: new Date().toISOString(),
        chunks: [],
        lastSync: null,
        totalCommits: 0,
        compactedAt: null,
      };
    }

    // Create bundle
    const fromCommit = isFirstSync ? null : lastSyncCommit;
    const bundleBuffer = await this._createBundle(fromCommit);

    // Encrypt and write chunk
    const chunkNum = manifest.chunks.length + 1;
    const chunkId = this._chunkName(chunkNum);
    const encrypted = encryptChunk(bundleBuffer, this.password);
    await this.transport.writeFile(workspaceId + '/' + chunkId, encrypted);

    // Count commits in this chunk
    const commitCount = await this._countCommits(fromCommit, headCommit);

    // Update manifest
    manifest.chunks.push({
      id: chunkId,
      type: isFirstSync ? 'full' : 'incremental',
      fromCommit: fromCommit || null,
      toCommit: headCommit,
      commitCount,
      size: encrypted.length,
      createdAt: new Date().toISOString(),
    });
    manifest.lastSync = new Date().toISOString();
    manifest.totalCommits += commitCount;

    await this._writeManifest(workspaceId, manifest);

    // Update local config
    config.backup.lastSyncCommit = headCommit;
    config.backup.chunkCount = manifest.chunks.length;
    this.claw.saveConfig(config);

    const totalSize = manifest.chunks.reduce((s, c) => s + c.size, 0);
    return {
      synced: true,
      chunkCount: manifest.chunks.length,
      totalSize,
      lastSync: manifest.lastSync,
    };
  }

  /**
   * Restore from encrypted backup to a destination directory.
   * @param {string} destDir - Where to restore
   */
  async restore(destDir) {
    const workspaceId = this._getWorkspaceId();
    const manifest = await this._readManifest(workspaceId);
    if (!manifest) throw new Error('No backup found');
    if (!manifest.chunks.length) throw new Error('Backup has no chunks');

    destDir = path.resolve(destDir);
    const tmpDir = path.join(os.tmpdir(), 'clawkeep-restore-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Download and decrypt all chunks
      const bundlePaths = [];
      for (const chunk of manifest.chunks) {
        const encData = await this.transport.readFile(workspaceId + '/' + chunk.id);
        const bundle = decryptChunk(encData, this.password);
        const bundlePath = path.join(tmpDir, chunk.id.replace('.enc', '.bundle'));
        fs.writeFileSync(bundlePath, bundle);
        bundlePaths.push(bundlePath);
      }

      // Apply bundles: clone from first (full), then pull incrementals
      const repoDir = path.join(tmpDir, 'repo');
      const simpleGit = require('simple-git');

      // Clone from first bundle
      await simpleGit().clone(bundlePaths[0], repoDir);

      // Apply incremental bundles
      const repo = simpleGit(repoDir);
      for (let i = 1; i < bundlePaths.length; i++) {
        await repo.raw(['pull', bundlePaths[i], 'main']);
      }

      // Copy working tree to destination (exclude .git)
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      this._copyDir(repoDir, destDir);

      return { ok: true, chunks: manifest.chunks.length, totalCommits: manifest.totalCommits };
    } finally {
      // Clean up temp dir
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Static restore: restore from a backup path without needing an initialized repo.
   * Used when restoring to a brand new directory.
   */
  static async restoreFrom(transport, workspaceId, password, destDir) {
    const manifestPath = workspaceId + '/manifest.enc';
    const encManifest = await transport.readFile(manifestPath);
    const manifest = JSON.parse(decryptChunk(encManifest, password).toString('utf8'));

    if (!manifest.chunks.length) throw new Error('Backup has no chunks');

    destDir = path.resolve(destDir);
    const tmpDir = path.join(os.tmpdir(), 'clawkeep-restore-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      const bundlePaths = [];
      for (const chunk of manifest.chunks) {
        const encData = await transport.readFile(workspaceId + '/' + chunk.id);
        const bundle = decryptChunk(encData, password);
        const bundlePath = path.join(tmpDir, chunk.id.replace('.enc', '.bundle'));
        fs.writeFileSync(bundlePath, bundle);
        bundlePaths.push(bundlePath);
      }

      const repoDir = path.join(tmpDir, 'repo');
      const simpleGit = require('simple-git');

      await simpleGit().clone(bundlePaths[0], repoDir);

      const repo = simpleGit(repoDir);
      for (let i = 1; i < bundlePaths.length; i++) {
        await repo.raw(['pull', bundlePaths[i], 'main']);
      }

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      SyncManager._copyDir(repoDir, destDir);

      return { ok: true, chunks: manifest.chunks.length, totalCommits: manifest.totalCommits };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Compact: merge all chunks into a single full bundle.
   */
  async compact() {
    const workspaceId = this._getWorkspaceId();
    const manifest = await this._readManifest(workspaceId);
    if (!manifest) throw new Error('No backup found');
    if (manifest.chunks.length <= 1) {
      return { compacted: false, message: 'Nothing to compact (1 or fewer chunks)' };
    }

    const tmpDir = path.join(os.tmpdir(), 'clawkeep-compact-' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      // Download and decrypt all chunks
      const bundlePaths = [];
      for (const chunk of manifest.chunks) {
        const encData = await this.transport.readFile(workspaceId + '/' + chunk.id);
        const bundle = decryptChunk(encData, this.password);
        const bundlePath = path.join(tmpDir, chunk.id.replace('.enc', '.bundle'));
        fs.writeFileSync(bundlePath, bundle);
        bundlePaths.push(bundlePath);
      }

      // Reconstruct full repo
      const repoDir = path.join(tmpDir, 'repo');
      const simpleGit = require('simple-git');

      await simpleGit().clone(bundlePaths[0], repoDir);
      const repo = simpleGit(repoDir);
      for (let i = 1; i < bundlePaths.length; i++) {
        await repo.raw(['pull', bundlePaths[i], 'main']);
      }

      // Create single full bundle
      const fullBundlePath = path.join(tmpDir, 'full.bundle');
      await repo.raw(['bundle', 'create', fullBundlePath, '--all']);
      const fullBundleBuffer = fs.readFileSync(fullBundlePath);

      // Delete old chunks
      for (const chunk of manifest.chunks) {
        await this.transport.deleteFile(workspaceId + '/' + chunk.id);
      }

      // Encrypt and write new full chunk
      const encrypted = encryptChunk(fullBundleBuffer, this.password);
      const newChunkId = this._chunkName(1);
      await this.transport.writeFile(workspaceId + '/' + newChunkId, encrypted);

      // Get final commit hash
      const headHash = (await repo.revparse(['HEAD'])).trim();
      const totalCommits = parseInt((await repo.raw(['rev-list', '--count', 'HEAD'])).trim()) || 0;

      // Update manifest
      const newManifest = {
        version: 1,
        workspaceId,
        createdAt: manifest.createdAt,
        chunks: [{
          id: newChunkId,
          type: 'full',
          fromCommit: null,
          toCommit: headHash,
          commitCount: totalCommits,
          size: encrypted.length,
          createdAt: new Date().toISOString(),
        }],
        lastSync: new Date().toISOString(),
        totalCommits,
        compactedAt: new Date().toISOString(),
      };

      await this._writeManifest(workspaceId, newManifest);

      // Update local config
      const config = this.claw.loadConfig();
      config.backup.chunkCount = 1;
      this.claw.saveConfig(config);

      return {
        compacted: true,
        oldChunks: manifest.chunks.length,
        newSize: encrypted.length,
      };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  /**
   * Get sync status from manifest.
   */
  async getStatus() {
    const config = this.claw.loadConfig();
    const workspaceId = config.backup?.workspaceId;
    if (!workspaceId) return { synced: false };

    try {
      const manifest = await this._readManifest(workspaceId);
      if (!manifest) return { synced: false };

      const totalSize = manifest.chunks.reduce((s, c) => s + c.size, 0);
      return {
        synced: true,
        chunkCount: manifest.chunks.length,
        totalSize,
        totalCommits: manifest.totalCommits,
        lastSync: manifest.lastSync,
        compactedAt: manifest.compactedAt,
        workspaceId,
      };
    } catch {
      return { synced: false };
    }
  }

  /**
   * Copy directory recursively, excluding .git.
   */
  _copyDir(src, dest) {
    SyncManager._copyDir(src, dest);
  }

  static _copyDir(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        SyncManager._copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

module.exports = SyncManager;
