'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function snap(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Taking snapshot...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner.fail('ClawKeep not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    const result = await claw.snap(opts.message || null);

    if (!result) {
      spinner.info('No changes to snapshot.');
      return;
    }

    spinner.succeed(`Snapshot taken: ${chalk.cyan(result.hash.substring(0, 8))}`);
    console.log(`  ${chalk.dim(result.message)}`);
    console.log(
      `  ${chalk.green('+' + result.summary.insertions)} ${chalk.red('-' + result.summary.deletions)} across ${result.summary.changed} file(s)`
    );
  } catch (err) {
    spinner.fail('Snapshot failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
