'use strict';

const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function log(opts) {
  const dir = path.resolve(opts.dir || '.');

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.error(chalk.red('ClawKeep not initialized. Run `clawkeep init` first.'));
      process.exit(1);
    }

    const entries = await claw.log(parseInt(opts.limit) || 20);

    if (entries.length === 0) {
      console.log(chalk.dim('No snapshots yet. Run `clawkeep snap` to create one.'));
      return;
    }

    console.log(chalk.bold(`📋 Snapshot History (${entries.length} entries)\n`));

    for (const entry of entries) {
      const hash = chalk.yellow(entry.hash.substring(0, 8));
      const date = chalk.dim(entry.date);
      const msg = entry.message;

      if (opts.oneline) {
        console.log(`${hash} ${msg} ${date}`);
      } else {
        console.log(`${hash} — ${msg}`);
        console.log(`  ${date}`);
        console.log('');
      }
    }
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
