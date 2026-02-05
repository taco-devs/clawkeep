'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function push(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Pushing to remote...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner.fail('ClawKeep not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    // Set remote if provided
    if (opts.remote) {
      spinner.text = 'Setting remote...';
      await claw.setRemote(opts.remote);
    }

    const config = claw.loadConfig();
    if (!config.remote && !opts.remote) {
      spinner.fail('No remote configured. Use `clawkeep push -r <url>`');
      process.exit(1);
    }

    spinner.text = 'Pushing snapshots...';
    await claw.push();

    spinner.succeed('Pushed to remote!');
    console.log(chalk.dim(`  Remote: ${config.remote || opts.remote}`));
  } catch (err) {
    spinner.fail('Push failed');
    console.error(chalk.red(err.message));
    if (err.message.includes('Authentication')) {
      console.log(chalk.dim('  Hint: Make sure your remote URL includes credentials or SSH key is set up.'));
    }
    process.exit(1);
  }
};
