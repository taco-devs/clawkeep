'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');
const { detectFramework } = require('../core/detect');

module.exports = async function init(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Initializing ClawKeep...').start();

  try {
    const claw = new ClawGit(dir);

    // Check if already initialized
    if (await claw.isInitialized()) {
      spinner.warn('ClawKeep is already initialized in this directory.');
      const config = claw.loadConfig();
      console.log(chalk.dim(`  Framework: ${config.framework}`));
      console.log(chalk.dim(`  Agent: ${config.agentName}`));
      return;
    }

    // Detect framework
    let framework = { framework: 'generic', agentName: path.basename(dir) };
    if (opts.detect !== false) {
      spinner.text = 'Detecting agent framework...';
      framework = detectFramework(dir);
    }

    spinner.text = `Setting up ClawKeep for ${framework.framework}...`;

    // Initialize
    const config = await claw.init({
      framework: framework.framework,
      agentName: framework.agentName,
      trackSecrets: true,
    });

    // Take initial snapshot
    spinner.text = 'Taking initial snapshot...';
    const result = await claw.snap('init: clawkeep initialized');

    spinner.succeed('ClawKeep initialized!');
    console.log('');
    console.log(chalk.bold('  🐾 ClawKeep is now tracking this directory'));
    console.log('');
    console.log(`  Framework:  ${chalk.cyan(config.framework)}`);
    console.log(`  Agent:      ${chalk.cyan(config.agentName)}`);
    console.log(`  Secrets:    ${chalk.yellow(config.trackSecrets ? 'included (encrypted on export)' : 'excluded')}`);
    if (result) {
      console.log(`  Initial:    ${chalk.green(result.summary.changed + ' files tracked')}`);
    }
    console.log('');
    console.log(chalk.dim('  Run `clawkeep snap` to take snapshots'));
    console.log(chalk.dim('  Run `clawkeep watch` to auto-track changes'));
    console.log(chalk.dim('  Run `clawkeep push -r <url>` to sync to remote'));
  } catch (err) {
    spinner.fail('Failed to initialize ClawKeep');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
