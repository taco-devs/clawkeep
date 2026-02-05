'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function init(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Initializing ClawKeep...').start();

  try {
    const claw = new ClawGit(dir);

    if (await claw.isInitialized()) {
      spinner.warn('ClawKeep is already initialized here.');
      console.log(chalk.dim('  Run `clawkeep status` for details.'));
      return;
    }

    const config = await claw.init();

    // Take initial backup
    spinner.text = 'Taking initial backup...';
    const result = await claw.snap('initial backup');

    spinner.succeed(chalk.bold('ClawKeep initialized!'));
    console.log('');
    console.log(chalk.bold.cyan('  🐾 Directory is now backed up'));
    console.log('');
    if (result) {
      console.log(`  ${chalk.dim('Tracked')}     ${chalk.white(result.summary.changed + ' files')}`);
      console.log(`  ${chalk.dim('Backup')}      ${chalk.yellow(result.hash.substring(0, 8))}`);
    }
    console.log('');
    console.log(chalk.dim('  Next steps:'));
    console.log(chalk.dim('  $ clawkeep watch          Auto-backup on file changes'));
    console.log(chalk.dim('  $ clawkeep backup local   Set up backup target'));
    console.log(chalk.dim('  $ clawkeep snap -m "..."  Manual backup'));
    console.log('');
  } catch (err) {
    spinner.fail('Failed to initialize');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
};
