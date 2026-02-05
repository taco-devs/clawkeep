'use strict';

const chalk = require('chalk');
const path = require('path');
const chokidar = require('chokidar');
const ClawGit = require('../core/git');

module.exports = async function watch(opts) {
  const dir = path.resolve(opts.dir || '.');
  const interval = parseInt(opts.interval) || 5000;
  const autoPush = opts.push || false;
  const quiet = opts.quiet || false;

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
      process.exit(1);
    }

    const config = claw.loadConfig();

    if (!quiet) {
      console.log('');
      console.log(chalk.bold.cyan('  🐾 ClawKeep watching...'));
      console.log('');
      console.log(`  ${chalk.dim('Directory')}   ${dir}`);
      console.log(`  ${chalk.dim('Agent')}       ${config.agentName} (${config.framework})`);
      console.log(`  ${chalk.dim('Debounce')}    ${interval}ms`);
      console.log(`  ${chalk.dim('Auto-push')}   ${autoPush ? chalk.green('on') : chalk.dim('off')}`);
      console.log('');
      console.log(chalk.dim('  Waiting for changes... (Ctrl+C to stop)'));
      console.log('');
    }

    let debounceTimer = null;
    let changedFiles = new Set();
    let snapCount = 0;

    const ignored = [
      '**/node_modules/**',
      '**/.git/**',
      '**/.clawkeep/**',
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
          snapCount++;
          const now = new Date().toISOString().substring(11, 19);
          const hash = chalk.yellow(result.hash.substring(0, 8));

          if (!quiet) {
            console.log(`  ${chalk.dim(now)} ${chalk.green('⬤')} ${hash} ${chalk.dim(result.message)}`);
          }

          if (autoPush && config.remote) {
            try {
              await claw.push();
              if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.blue('↑')} ${chalk.dim('pushed')}`);
            } catch (pushErr) {
              if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.yellow('⚠')} ${chalk.dim('push failed: ' + pushErr.message)}`);
            }
          }
        }
      } catch (err) {
        if (!quiet) console.error(chalk.red(`  Error: ${err.message}`));
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

    process.on('SIGINT', () => {
      if (!quiet) {
        console.log('');
        console.log(chalk.dim(`  Stopped. ${snapCount} snapshot(s) taken this session.`));
      }
      watcher.close();
      process.exit(0);
    });
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
