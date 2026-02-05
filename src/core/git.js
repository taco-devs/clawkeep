'use strict';

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

/**
 * Core git operations for ClawKeep.
 * Wraps simple-git with agent-friendly semantics.
 * Linear history only — no branches.
 */
class ClawGit {
  constructor(dir) {
    this.dir = path.resolve(dir);
    this.gitDir = path.join(this.dir, '.clawkeep', 'repo');
    this.git = simpleGit(this.dir);
  }

  /** Check if clawkeep is initialized in this directory */
  async isInitialized() {
    const configPath = path.join(this.dir, '.clawkeep', 'config.json');
    return fs.existsSync(configPath);
  }

  /** Initialize a new clawkeep repo */
  async init(config = {}) {
    const clawkeepDir = path.join(this.dir, '.clawkeep');
    
    // Create .clawkeep config directory
    if (!fs.existsSync(clawkeepDir)) {
      fs.mkdirSync(clawkeepDir, { recursive: true });
    }

    // Initialize git if not already a repo
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
    }

    // Set git config for clawkeep commits
    await this.git.addConfig('user.name', config.agentName || 'ClawKeep');
    await this.git.addConfig('user.email', config.agentEmail || 'agent@clawkeep.com');

    // Write config
    const clawConfig = {
      version: '0.1.0',
      createdAt: new Date().toISOString(),
      framework: config.framework || 'unknown',
      agentName: config.agentName || 'unknown',
      trackSecrets: config.trackSecrets !== false, // default: include secrets
      remote: config.remote || null,
      watchInterval: config.watchInterval || 5000,
      ignore: config.ignore || [],
    };
    
    fs.writeFileSync(
      path.join(clawkeepDir, 'config.json'),
      JSON.stringify(clawConfig, null, 2)
    );

    return clawConfig;
  }

  /** Load clawkeep config */
  loadConfig() {
    const configPath = path.join(this.dir, '.clawkeep', 'config.json');
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  /** Save clawkeep config */
  saveConfig(config) {
    const configPath = path.join(this.dir, '.clawkeep', 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  }

  /** Stage all changes and commit */
  async snap(message) {
    // Stage everything
    await this.git.add('-A');

    // Check if there are staged changes
    const status = await this.git.status();
    if (status.staged.length === 0 && status.files.length === 0) {
      return null; // Nothing to commit
    }

    // Re-add after status check (sometimes needed)
    await this.git.add('-A');

    // Generate auto-message if none provided
    if (!message) {
      message = this._autoMessage(status);
    }

    // Commit
    const result = await this.git.commit(message);
    return {
      hash: result.commit,
      message,
      summary: {
        changed: status.files.length,
        insertions: result.summary.insertions,
        deletions: result.summary.deletions,
      },
    };
  }

  /** Get diff since last snap */
  async diff(statOnly = false) {
    // Stage everything first to include untracked files in diff
    await this.git.add('-A');
    
    const args = ['--cached'];
    if (statOnly) args.push('--stat');
    
    const result = await this.git.diff(args);
    
    // Reset staging (we only wanted to see the diff)
    await this.git.reset();
    
    return result;
  }

  /** Get snapshot history */
  async log(limit = 20) {
    try {
      const result = await this.git.log({
        maxCount: limit,
        '--format': '%H|%ai|%s',
      });
      return result.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
      }));
    } catch (e) {
      // No commits yet
      if (e.message.includes('does not have any commits')) return [];
      throw e;
    }
  }

  /** Get current status */
  async status() {
    const status = await this.git.status();
    return {
      modified: status.modified,
      added: status.not_added,
      deleted: status.deleted,
      renamed: status.renamed,
      total: status.files.length,
      clean: status.isClean(),
    };
  }

  /** Restore to a specific point */
  async restore(ref, hard = false) {
    if (hard) {
      await this.git.reset(['--hard', ref]);
    } else {
      // Create a new commit that reverts to that state
      await this.git.checkout(ref, ['--', '.']);
      await this.snap(`restore: reverted to ${ref.substring(0, 8)}`);
    }
  }

  /** Set up remote */
  async setRemote(url) {
    const remotes = await this.git.getRemotes();
    const hasOrigin = remotes.some((r) => r.name === 'origin');
    
    if (hasOrigin) {
      await this.git.remote(['set-url', 'origin', url]);
    } else {
      await this.git.addRemote('origin', url);
    }

    // Update config
    const config = this.loadConfig();
    if (config) {
      config.remote = url;
      this.saveConfig(config);
    }
  }

  /** Push to remote */
  async push() {
    await this.git.push('origin', 'main', ['--set-upstream']);
  }

  /** Pull from remote */
  async pull() {
    await this.git.pull('origin', 'main');
  }

  /** Generate automatic commit message from status */
  _autoMessage(status) {
    const parts = [];
    const modified = status.modified || [];
    const created = status.not_added || [];
    const deleted = status.deleted || [];
    const staged = status.staged || [];

    // Count files by type
    const allFiles = status.files.map((f) => f.path);
    const memoryFiles = allFiles.filter(
      (f) => f.includes('memory') || f.includes('MEMORY') || f.endsWith('.md')
    );
    const configFiles = allFiles.filter(
      (f) =>
        f.includes('config') ||
        f.includes('.json') ||
        f.includes('.yaml') ||
        f.includes('.yml')
    );

    if (memoryFiles.length > 0) {
      parts.push(`memory: ${memoryFiles.length} file(s)`);
    }
    if (configFiles.length > 0) {
      parts.push(`config: ${configFiles.length} file(s)`);
    }

    const otherCount = allFiles.length - memoryFiles.length - configFiles.length;
    if (otherCount > 0) {
      parts.push(`other: ${otherCount} file(s)`);
    }

    if (parts.length === 0) {
      return `snap: ${allFiles.length} file(s) updated`;
    }

    return `snap: ${parts.join(', ')}`;
  }
}

module.exports = ClawGit;
