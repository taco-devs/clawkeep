'use strict';

const chalk = require('chalk');
const path = require('path');
const chokidar = require('chokidar');
const ClawGit = require('../core/git');

module.exports = async function watch(opts) {
  const dir = path.resolve(opts.dir || '.');
  const interval = parseInt(opts.interval) || 5000;
  const autoPush = opts.push || false;

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.error(chalk.red('ClawKeep not initialized. Run `clawkeep init` first.'));
      process.exit(1);
    }

    const config = claw.loadConfig();

    console.log(chalk.bold('🐾 ClawKeep watching for changes...'));
    console.log(chalk.dim(`  Directory: ${dir}`));
    console.log(chalk.dim(`  Debounce:  ${interval}ms`));
    console.log(chalk.dim(`  Auto-push: ${autoPush ? 'yes' : 'no'}`));
    console.log('');

    let debounceTimer = null;
    let changedFiles = new Set();

    const ignored = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.clawkeep/repo/**',
      ...(config.ignore || []),
    ];

    const watcher = chokidar.watch(dir, {
      ignored,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    const doSnap = async () => {
      const files = Array.from(changedFiles);
      changedFiles.clear();

      if (files.length === 0) return;

      try {
        const result = await claw.snap();

        if (result) {
          const now = new Date().toISOString().substring(11, 19);
          console.log(
            `${chalk.dim(now)} ${chalk.green('⬤')} ${chalk.cyan(result.hash.substring(0, 8))} — ${result.message}`
          );

          if (autoPush && config.remote) {
            try {
              await claw.push();
              console.log(chalk.dim(`  ↑ pushed to remote`));
            } catch (pushErr) {
              console.log(chalk.yellow(`  ⚠ push failed: ${pushErr.message}`));
            }
          }
        }
      } catch (err) {
        console.error(chalk.red(`  Snap error: ${err.message}`));
      }
    };

    const onFileChange = (eventType, filePath) => {
      const relative = path.relative(dir, filePath);
      changedFiles.add(relative);

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doSnap, interval);
    };

    watcher.on('add', (p) => onFileChange('add', p));
    watcher.on('change', (p) => onFileChange('change', p));
    watcher.on('unlink', (p) => onFileChange('unlink', p));

    // Keep process alive
    process.on('SIGINT', () => {
      console.log(chalk.dim('\n  ClawKeep watcher stopped.'));
      watcher.close();
      process.exit(0);
    });
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
