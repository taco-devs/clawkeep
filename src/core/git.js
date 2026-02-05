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

    if (!fs.existsSync(clawkeepDir)) {
      fs.mkdirSync(clawkeepDir, { recursive: true });
    }

    // Initialize git if not already a repo
    const isRepo = await this.git.checkIsRepo().catch(() => false);
    if (!isRepo) {
      await this.git.init();
      // Ensure we're on 'main' branch
      await this.git.checkout(['-b', 'main']).catch(() => {});
    }

    // Set git config
    await this.git.addConfig('user.name', config.agentName || 'ClawKeep');
    await this.git.addConfig('user.email', config.agentEmail || 'agent@clawkeep.com');

    // Write config
    const clawConfig = {
      version: '0.1.0',
      createdAt: new Date().toISOString(),
      framework: config.framework || 'unknown',
      agentName: config.agentName || 'unknown',
      trackSecrets: config.trackSecrets !== false,
      remote: config.remote || null,
      watchInterval: config.watchInterval || 5000,
      ignore: config.ignore || [],
      stats: {
        totalSnaps: 0,
        firstSnap: null,
        lastSnap: null,
      },
    };

    fs.writeFileSync(
      path.join(clawkeepDir, 'config.json'),
      JSON.stringify(clawConfig, null, 2)
    );

    // Write default .clawkeepignore
    const ignorePath = path.join(this.dir, '.clawkeepignore');
    if (!fs.existsSync(ignorePath)) {
      fs.writeFileSync(
        ignorePath,
        '# ClawKeep ignore file\n# Add patterns here to exclude files from tracking\n# Secrets are tracked by default (encrypted on export)\n\n# Example:\n# *.log\n# tmp/\n'
      );
    }

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
    // Load ignore patterns
    const ignorePatterns = this._loadIgnorePatterns();
    
    // Stage everything
    await this.git.add('-A');

    // Check if there are changes
    const status = await this.git.status();
    if (status.staged.length === 0 && status.files.length === 0) {
      return null;
    }

    await this.git.add('-A');

    // Generate smart message if none provided
    if (!message) {
      message = this._smartMessage(status);
    }

    const result = await this.git.commit(message);

    // Update stats
    const config = this.loadConfig();
    if (config) {
      config.stats = config.stats || {};
      config.stats.totalSnaps = (config.stats.totalSnaps || 0) + 1;
      config.stats.lastSnap = new Date().toISOString();
      if (!config.stats.firstSnap) {
        config.stats.firstSnap = config.stats.lastSnap;
      }
      this.saveConfig(config);
    }

    return {
      hash: result.commit,
      message,
      summary: {
        changed: status.files.length,
        insertions: result.summary.insertions,
        deletions: result.summary.deletions,
      },
      files: status.files.map((f) => ({
        path: f.path,
        status: f.working_dir || f.index,
      })),
    };
  }

  /** Get diff since last snap */
  async diff(statOnly = false) {
    await this.git.add('-A');
    const args = ['--cached'];
    if (statOnly) args.push('--stat');
    const result = await this.git.diff(args);
    await this.git.reset();
    return result;
  }

  /** Get snapshot history */
  async log(limit = 20) {
    try {
      const result = await this.git.log({ maxCount: limit });
      return result.all.map((entry) => ({
        hash: entry.hash,
        date: entry.date,
        message: entry.message,
        author: entry.author_name,
      }));
    } catch (e) {
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
      staged: status.staged,
      total: status.files.length,
      clean: status.isClean(),
      files: status.files,
    };
  }

  /** Get full stats */
  async getStats() {
    const config = this.loadConfig();
    const stats = config?.stats || {};

    let totalCommits = 0;
    try {
      const log = await this.git.log();
      totalCommits = log.total;
    } catch (e) {
      // no commits
    }

    // Calculate days tracked
    let daysTracked = 0;
    if (stats.firstSnap) {
      const first = new Date(stats.firstSnap);
      daysTracked = Math.ceil((Date.now() - first.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Count tracked files
    let trackedFiles = 0;
    try {
      const files = await this.git.raw(['ls-files']);
      trackedFiles = files.trim().split('\n').filter(Boolean).length;
    } catch (e) {
      // ignore
    }

    return {
      totalSnaps: totalCommits,
      daysTracked,
      trackedFiles,
      firstSnap: stats.firstSnap,
      lastSnap: stats.lastSnap,
    };
  }

  /** Restore to a specific point */
  async restore(ref, hard = false) {
    if (hard) {
      await this.git.reset(['--hard', ref]);
    } else {
      await this.git.checkout(ref, ['--', '.']);
      await this.snap(`⏪ restore: reverted to ${ref.substring(0, 8)}`);
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

    const config = this.loadConfig();
    if (config) {
      config.remote = url;
      this.saveConfig(config);
    }
  }

  /** Push to remote */
  async push() {
    try {
      await this.git.push('origin', 'main', ['--set-upstream']);
    } catch (e) {
      // Try current branch if main doesn't exist
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      await this.git.push('origin', branch.trim(), ['--set-upstream']);
    }
  }

  /** Pull from remote */
  async pull() {
    await this.git.pull('origin', 'main', { '--rebase': 'true' });
  }

  /** Load .clawkeepignore patterns */
  _loadIgnorePatterns() {
    const ignorePath = path.join(this.dir, '.clawkeepignore');
    if (!fs.existsSync(ignorePath)) return [];
    return fs
      .readFileSync(ignorePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  /** Generate smart commit message from status */
  _smartMessage(status) {
    const files = status.files.map((f) => f.path);
    
    // Categorize changes
    const categories = {
      memory: [],
      config: [],
      soul: [],
      workspace: [],
      other: [],
    };

    for (const f of files) {
      const lower = f.toLowerCase();
      if (lower.includes('memory') || lower.match(/\d{4}-\d{2}-\d{2}/)) {
        categories.memory.push(f);
      } else if (
        lower.includes('soul') ||
        lower.includes('identity') ||
        lower.includes('agents.md')
      ) {
        categories.soul.push(f);
      } else if (
        lower.includes('config') ||
        lower.endsWith('.json') ||
        lower.endsWith('.yml') ||
        lower.endsWith('.yaml') ||
        lower.endsWith('.env') ||
        lower.includes('tools')
      ) {
        categories.config.push(f);
      } else if (
        lower.includes('workspace') ||
        lower.includes('scripts') ||
        lower.endsWith('.js') ||
        lower.endsWith('.py') ||
        lower.endsWith('.ts')
      ) {
        categories.workspace.push(f);
      } else {
        categories.other.push(f);
      }
    }

    const parts = [];
    const emoji = [];

    if (categories.memory.length) {
      emoji.push('🧠');
      parts.push(`memory(${categories.memory.length})`);
    }
    if (categories.soul.length) {
      emoji.push('✨');
      parts.push(`soul(${categories.soul.length})`);
    }
    if (categories.config.length) {
      emoji.push('⚙️');
      parts.push(`config(${categories.config.length})`);
    }
    if (categories.workspace.length) {
      emoji.push('📁');
      parts.push(`workspace(${categories.workspace.length})`);
    }
    if (categories.other.length) {
      parts.push(`files(${categories.other.length})`);
    }

    // For single-file changes, be more specific
    if (files.length === 1) {
      const file = path.basename(files[0]);
      const e = emoji[0] || '📝';
      return `${e} ${file} updated`;
    }

    if (files.length <= 3) {
      const e = emoji[0] || '📝';
      const names = files.map((f) => path.basename(f)).join(', ');
      return `${e} ${names}`;
    }

    const e = emoji.join('') || '📝';
    return `${e} ${parts.join(' · ')} — ${files.length} files`;
  }
}

module.exports = ClawGit;
