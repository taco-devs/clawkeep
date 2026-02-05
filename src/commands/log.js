'use strict';

const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function log(opts) {
  const dir = path.resolve(opts.dir || '.');

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
      process.exit(1);
    }

    const entries = await claw.log(parseInt(opts.limit) || 20);

    if (entries.length === 0) {
      console.log(chalk.dim('No snapshots yet.'));
      return;
    }

    // JSON output
    if (opts.json) {
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    console.log('');
    console.log(chalk.bold(`  📋 ${entries.length} snapshot${entries.length > 1 ? 's' : ''}`));
    console.log('');

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const hash = chalk.yellow(entry.hash.substring(0, 8));
      const date = _formatDate(entry.date);
      const msg = entry.message;
      const isFirst = i === 0;

      if (opts.oneline) {
        console.log(`  ${hash} ${msg} ${chalk.dim(date)}`);
      } else {
        const marker = isFirst ? chalk.green('●') : chalk.dim('○');
        console.log(`  ${marker} ${hash} — ${msg}`);
        console.log(`  ${chalk.dim('│')} ${chalk.dim(date)}`);
        if (i < entries.length - 1) {
          console.log(`  ${chalk.dim('│')}`);
        }
      }
    }
    console.log('');
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};

function _formatDate(dateStr) {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toISOString().substring(0, 16).replace('T', ' ');
  } catch {
    return dateStr;
  }
}
