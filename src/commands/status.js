'use strict';

const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function status(opts) {
  const dir = path.resolve(opts.dir || '.');

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      console.log(chalk.yellow('ClawKeep is not initialized in this directory.'));
      console.log(chalk.dim('Run `clawkeep init` to start tracking.'));
      return;
    }

    const config = claw.loadConfig();
    const gitStatus = await claw.status();
    const history = await claw.log(1);

    console.log(chalk.bold('\n🐾 ClawKeep Status\n'));
    console.log(`  Framework:    ${chalk.cyan(config.framework)}`);
    console.log(`  Agent:        ${chalk.cyan(config.agentName)}`);
    console.log(`  Secrets:      ${chalk.yellow(config.trackSecrets ? 'tracked' : 'excluded')}`);
    console.log(`  Remote:       ${config.remote ? chalk.green(config.remote) : chalk.dim('not configured')}`);
    console.log(`  Version:      ${chalk.dim(config.version)}`);
    console.log('');

    if (gitStatus.clean) {
      console.log(`  State:        ${chalk.green('● clean')} — no pending changes`);
    } else {
      console.log(`  State:        ${chalk.yellow('● modified')} — ${gitStatus.total} file(s) changed`);
      if (gitStatus.modified.length > 0) {
        console.log(`  Modified:     ${chalk.yellow(gitStatus.modified.join(', '))}`);
      }
      if (gitStatus.added.length > 0) {
        console.log(`  New:          ${chalk.green(gitStatus.added.join(', '))}`);
      }
      if (gitStatus.deleted.length > 0) {
        console.log(`  Deleted:      ${chalk.red(gitStatus.deleted.join(', '))}`);
      }
    }

    if (history.length > 0) {
      const last = history[0];
      console.log(`  Last snap:    ${chalk.dim(last.date)} — ${last.message}`);
    } else {
      console.log(`  Last snap:    ${chalk.dim('none')}`);
    }

    console.log('');
  } catch (err) {
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
