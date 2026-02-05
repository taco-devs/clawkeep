'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function snap(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = opts.quiet ? null : ora('Backing up...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner?.fail('Not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    const result = await claw.snap(opts.message || null);

    if (!result) {
      if (spinner) spinner.info(chalk.dim('Nothing changed.'));
      return;
    }

    const hash = chalk.yellow(result.hash.substring(0, 8));
    const ins = chalk.green('+' + result.summary.insertions);
    const del = chalk.red('-' + result.summary.deletions);
    const count = result.summary.changed;

    if (spinner) {
      spinner.succeed(`${hash} ${chalk.dim(result.message)}`);
      console.log(`  ${ins} ${del} across ${count} file(s)`);
      
      // Show changed files (up to 5)
      if (result.files && result.files.length <= 5) {
        for (const f of result.files) {
          const icon = f.status === '?' ? chalk.green('+') : chalk.yellow('~');
          console.log(`  ${icon} ${chalk.dim(f.path)}`);
        }
      }
    } else if (opts.quiet) {
      // Machine-readable output
      console.log(result.hash.substring(0, 8));
    }
  } catch (err) {
    spinner?.fail('Backup failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
};
