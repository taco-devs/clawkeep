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

    if (await claw.isInitialized()) {
      spinner.warn('ClawKeep is already initialized here.');
      const config = claw.loadConfig();
      console.log(chalk.dim(`  Framework: ${config.framework} | Agent: ${config.agentName}`));
      console.log(chalk.dim('  Run `clawkeep status` for details.'));
      return;
    }

    // Detect or manually set framework
    let framework;
    if (opts.framework) {
      framework = {
        framework: opts.framework,
        agentName: opts.name || path.basename(dir),
      };
    } else if (opts.detect !== false) {
      spinner.text = 'Detecting agent framework...';
      framework = detectFramework(dir);
    } else {
      framework = { framework: 'generic', agentName: opts.name || path.basename(dir) };
    }

    if (opts.name) framework.agentName = opts.name;

    spinner.text = `Setting up ClawKeep for ${framework.framework}...`;

    const config = await claw.init({
      framework: framework.framework,
      agentName: framework.agentName,
      trackSecrets: true,
    });

    // Take initial snapshot
    spinner.text = 'Taking initial snapshot...';
    const result = await claw.snap('🎉 initial snapshot');

    spinner.succeed(chalk.bold('ClawKeep initialized!'));
    console.log('');
    console.log(chalk.bold.cyan('  🐾 Your agent\'s memory is now version-controlled'));
    console.log('');
    console.log(`  ${chalk.dim('Framework')}   ${chalk.white(config.framework)}`);
    console.log(`  ${chalk.dim('Agent')}       ${chalk.white(config.agentName)}`);
    console.log(`  ${chalk.dim('Secrets')}     ${chalk.green('✓ included')} ${chalk.dim('(encrypted on export)')}`);
    if (result) {
      console.log(`  ${chalk.dim('Tracked')}     ${chalk.white(result.summary.changed + ' files')}`);
      console.log(`  ${chalk.dim('Snapshot')}    ${chalk.yellow(result.hash.substring(0, 8))}`);
    }
    console.log('');
    console.log(chalk.dim('  Next steps:'));
    console.log(chalk.dim('  $ clawkeep watch          Auto-track file changes'));
    console.log(chalk.dim('  $ clawkeep push -r <url>  Sync to remote repo'));
    console.log(chalk.dim('  $ clawkeep snap -m "..."  Manual snapshot'));
    console.log('');
  } catch (err) {
    spinner.fail('Failed to initialize');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
};
