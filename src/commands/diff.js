'use strict';

const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function diff(opts) {
  const dir = path.resolve(opts.dir || '.');

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.error(chalk.red('ClawKeep not initialized. Run `clawkeep init` first.'));
      process.exit(1);
    }

    const result = await claw.diff(opts.stat);

    if (!result || result.trim() === '') {
      console.log(chalk.dim('No changes since last snapshot.'));
      return;
    }

    // Colorize diff output
    const lines = result.split('\n');
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(chalk.red(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan(line));
      } else if (line.startsWith('diff')) {
        console.log(chalk.bold(line));
      } else {
        console.log(line);
      }
    }
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
