'use strict';

const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function status(opts) {
  const dir = path.resolve(opts.dir || '.');

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.log('');
      console.log(chalk.yellow('  ClawKeep is not initialized here.'));
      console.log(chalk.dim('  Run `clawkeep init` to start tracking.'));
      console.log('');
      return;
    }

    const config = claw.loadConfig();
    const gitStatus = await claw.status();
    const stats = await claw.getStats();

    console.log('');
    console.log(chalk.bold('  ClawKeep Status'));
    console.log('');

    // Stats
    console.log(chalk.dim('  ── Stats ──────────────────────'));
    console.log(`  Backups:     ${chalk.white(stats.totalSnaps)}`);
    console.log(`  Files:       ${chalk.white(stats.trackedFiles)}`);
    console.log(`  Tracking:    ${stats.daysTracked > 0 ? chalk.white(stats.daysTracked + ' day(s)') : chalk.dim('today')}`);

    if (stats.lastSnap) {
      const ago = _timeAgo(new Date(stats.lastSnap));
      console.log(`  Last backup: ${chalk.dim(ago)}`);
    }

    // Current state
    console.log('');
    console.log(chalk.dim('  ── Changes ────────────────────'));
    if (gitStatus.clean) {
      console.log(`  ${chalk.green('●')} Clean — no pending changes`);
    } else {
      console.log(`  ${chalk.yellow('●')} ${gitStatus.total} file(s) changed since last backup`);

      const show = gitStatus.files.slice(0, 8);
      for (const f of show) {
        let icon, color;
        if (f.working_dir === '?' || f.index === '?') {
          icon = '+'; color = chalk.green;
        } else if (f.working_dir === 'D' || f.index === 'D') {
          icon = '-'; color = chalk.red;
        } else {
          icon = '~'; color = chalk.yellow;
        }
        console.log(`    ${color(icon)} ${chalk.dim(f.path)}`);
      }
      if (gitStatus.files.length > 8) {
        console.log(chalk.dim(`    ... and ${gitStatus.files.length - 8} more`));
      }
    }

    console.log('');
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};

function _timeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toISOString().substring(0, 10);
}
