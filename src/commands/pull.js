'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function pull(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Pulling from remote...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner.fail('ClawKeep not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    const config = claw.loadConfig();
    if (!config.remote) {
      spinner.fail('No remote configured. Use `clawkeep push -r <url>` first.');
      process.exit(1);
    }

    await claw.pull();

    spinner.succeed('Pulled from remote!');
  } catch (err) {
    spinner.fail('Pull failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
