'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function restore(ref, opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Restoring...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner.fail('ClawKeep not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    if (!ref) {
      spinner.fail('Please specify a snapshot reference (hash or HEAD~N).');
      console.log(chalk.dim('  Example: clawkeep restore abc123'));
      console.log(chalk.dim('  Example: clawkeep restore HEAD~3'));
      console.log(chalk.dim('  Run `clawkeep log` to see available snapshots.'));
      process.exit(1);
    }

    await claw.restore(ref, opts.hard);

    if (opts.hard) {
      spinner.succeed(`Hard restore to ${chalk.cyan(ref.substring(0, 8))}`);
      console.log(chalk.yellow('  ⚠️  Current changes were discarded.'));
    } else {
      spinner.succeed(`Restored to ${chalk.cyan(ref.substring(0, 8))} (new snapshot created)`);
      console.log(chalk.dim('  Your history is preserved. The restore is a new snapshot.'));
    }
  } catch (err) {
    spinner.fail('Restore failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
