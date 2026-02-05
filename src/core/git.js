'use strict';

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs');

/**
 * Core git operations for ClawKeep.
 * Wraps simple-git for versioned backups.
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
      await this.git.checkout(['-b', 'main']).catch(() => {});
    }

    // Set git config
    await this.git.addConfig('user.name', 'ClawKeep');
    await this.git.addConfig('user.email', 'backup@clawkeep.com');

    // Write config — minimal, no agent semantics
    const clawConfig = {
      version: '0.1.0',
      createdAt: new Date().toISOString(),
      remote: config.remote || null,
      watchInterval: config.watchInterval || 5000,
      ignore: config.ignore || [],
    };

    fs.writeFileSync(
      path.join(clawkeepDir, 'config.json'),
      JSON.stringify(clawConfig, null, 2)
    );

    // Write default .clawkeepignore with sensible defaults
    const ignorePath = path.join(this.dir, '.clawkeepignore');
    if (!fs.existsSync(ignorePath)) {
      fs.writeFileSync(
        ignorePath,
        [
          '# ClawKeep ignore — patterns here are synced to .gitignore',
          '# Add anything you don\'t want versioned',
          '',
          '# Dependencies',
          'node_modules/',
          'vendor/',
          '.venv/',
          '__pycache__/',
          '*.pyc',
          '',
          '# Build output',
          'dist/',
          'build/',
          '.next/',
          '',
          '# Environment & secrets',
          '.env',
          '.env.*',
          '*.pem',
          '*.key',
          '',
          '# Logs & temp',
          '*.log',
          'tmp/',
          '.cache/',
          '',
          '# ClawKeep internals',
          '.clawkeep/ui.pid',
          '.clawkeep/ui.token',
          '.clawkeep/watch.pid',
          '',
        ].join('\n')
      );
    }

    // Sync ignore patterns to .gitignore so git respects them
    this._syncIgnore();

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
    this._syncIgnore();
    await this.git.add('-A');

    const status = await this.git.status();
    if (status.staged.length === 0 && status.files.length === 0) {
      return null;
    }

    if (!message) {
      message = this._autoMessage(status);
    }

    const result = await this.git.commit(message);

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
    this._syncIgnore();
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

  /** Get full stats — computed from git log, no config dependency */
  async getStats() {
    let totalCommits = 0;
    let firstDate = null;
    let lastDate = null;
    try {
      const log = await this.git.log();
      totalCommits = log.total;
      if (log.latest) lastDate = log.latest.date;
      if (log.all.length) firstDate = log.all[log.all.length - 1].date;
    } catch (e) {
      // no commits
    }

    let daysTracked = 0;
    if (firstDate) {
      daysTracked = Math.ceil((Date.now() - new Date(firstDate).getTime()) / (1000 * 60 * 60 * 24));
    }

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
      firstSnap: firstDate,
      lastSnap: lastDate,
    };
  }

  /** Get files changed in a specific commit */
  async showCommit(hash) {
    try {
      const stat = await this.git.show([hash, '--stat', '--format=%H|%ai|%s|%an']);
      const lines = stat.trim().split('\n');
      const [h, date, message, author] = (lines[0] || '').split('|');
      const files = lines.slice(1).filter(l => l.trim() && !l.includes('changed')).map(l => {
        const match = l.trim().match(/^(.+?)\s+\|\s+(\d+)/);
        return match ? { path: match[1].trim(), changes: parseInt(match[2]) } : null;
      }).filter(Boolean);
      const summary = lines[lines.length - 1] || '';
      return { hash: h, date, message, author, files, summary };
    } catch (e) {
      return null;
    }
  }

  /** Get diff for a specific commit */
  async commitDiff(hash) {
    try {
      return await this.git.show([hash, '--format=']);
    } catch (e) {
      return '';
    }
  }

  /** Get diff between any two commits */
  async diffBetween(hash1, hash2) {
    try {
      return await this.git.diff([hash1, hash2]);
    } catch (e) {
      return '';
    }
  }

  /** Get last commit info for files in a directory */
  async fileHistory(dir) {
    try {
      const files = await this.git.raw(['ls-tree', '--name-only', 'HEAD', dir ? dir + '/' : '']);
      const result = {};
      const names = files.trim().split('\n').filter(Boolean).slice(0, 50);
      for (const f of names) {
        try {
          const log = await this.git.log({ maxCount: 1, file: f });
          if (log.latest) {
            result[f] = { hash: log.latest.hash, date: log.latest.date, message: log.latest.message };
          }
        } catch {}
      }
      return result;
    } catch {
      return {};
    }
  }

  /** List files/dirs at a specific commit (for time-travel browsing) */
  async listFilesAtCommit(hash, dir) {
    try {
      const treePath = dir ? hash + ':' + dir : hash;
      const raw = await this.git.raw(['ls-tree', treePath]);
      const lines = raw.trim().split('\n').filter(Boolean);
      const entries = lines.map(line => {
        // Format: <mode> <type> <hash>\t<name>
        const [info, name] = line.split('\t');
        const type = info.split(/\s+/)[1]; // 'tree' or 'blob'
        const fullPath = dir ? dir + '/' + name : name;
        return { name, type: type === 'tree' ? 'dir' : 'file', path: fullPath };
      });
      return entries.sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
    } catch {
      return [];
    }
  }

  /** Get file content at a specific commit */
  async showFileAtCommit(hash, filePath) {
    try {
      const content = await this.git.show([hash + ':' + filePath]);
      return { path: filePath, content, binary: false };
    } catch (e) {
      if (e.message.includes('binary')) {
        return { path: filePath, content: null, binary: true };
      }
      return null;
    }
  }

  /** Restore to a specific point */
  async restore(ref, hard = false) {
    if (hard) {
      await this.git.reset(['--hard', ref]);
    } else {
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
      const branch = await this.git.revparse(['--abbrev-ref', 'HEAD']);
      await this.git.push('origin', branch.trim(), ['--set-upstream']);
    }
  }

  /** Pull from remote */
  async pull() {
    await this.git.pull('origin', 'main', { '--rebase': 'true' });
  }

  /** Load .clawkeepignore patterns (parsed, no comments/blanks) */
  _loadIgnorePatterns() {
    const ignorePath = path.join(this.dir, '.clawkeepignore');
    if (!fs.existsSync(ignorePath)) return [];
    return fs
      .readFileSync(ignorePath, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  }

  /** Sync .clawkeepignore patterns into .gitignore (managed section) */
  _syncIgnore() {
    const patterns = this._loadIgnorePatterns();
    if (!patterns.length) return;

    const START = '# clawkeep-start';
    const END = '# clawkeep-end';
    const managed = [START, ...patterns, END].join('\n');

    const gitignorePath = path.join(this.dir, '.gitignore');
    let existing = '';
    if (fs.existsSync(gitignorePath)) {
      existing = fs.readFileSync(gitignorePath, 'utf8');
    }

    // Replace existing managed section or append
    const startIdx = existing.indexOf(START);
    const endIdx = existing.indexOf(END);
    let updated;
    if (startIdx !== -1 && endIdx !== -1) {
      updated = existing.substring(0, startIdx) + managed + existing.substring(endIdx + END.length);
    } else {
      updated = existing.trimEnd() + '\n\n' + managed + '\n';
    }

    // Only write if changed
    if (updated !== existing) {
      fs.writeFileSync(gitignorePath, updated);
    }
  }

  /** Generate simple auto-message */
  _autoMessage(status) {
    const n = status.files.length;
    if (n === 1) {
      return path.basename(status.files[0].path) + ' updated';
    }
    return 'snapshot — ' + n + ' files changed';
  }
}

module.exports = ClawGit;
