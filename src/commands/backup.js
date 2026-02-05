'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');
const BackupManager = require('../core/backup');

module.exports = async function backup(subcommand, args, opts) {
  const dir = path.resolve(opts.dir || '.');

  const claw = new ClawGit(dir);
  if (!(await claw.isInitialized())) {
    console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
    process.exit(1);
  }

  const bm = new BackupManager(claw);

  if (!subcommand || subcommand === 'status') {
    return showStatus(bm);
  } else if (subcommand === 'set-target') {
    return setTarget(bm, args, opts);
  } else if (subcommand === 'sync') {
    return doSync(bm);
  } else if (subcommand === 'pull') {
    return doPull(bm);
  } else if (subcommand === 'test') {
    return doTest(bm);
  } else {
    // Treat subcommand as target type shorthand: `clawkeep backup local /path`
    return setTarget(bm, subcommand, opts);
  }
};

async function showStatus(bm) {
  const cfg = bm.getConfig();
  console.log('');
  console.log(chalk.bold('  Backup Status'));
  console.log('');

  if (!cfg.target) {
    console.log(`  ${chalk.yellow('●')} No backup target configured`);
    console.log('');
    console.log(chalk.dim('  Set one up:'));
    console.log(chalk.dim('  $ clawkeep backup local /path/to/backup'));
    console.log(chalk.dim('  $ clawkeep backup git <remote-url>'));
  } else {
    const icon = { local: '📁', cloud: '🐾', s3: '🪣', git: '🔗' }[cfg.target] || '?';
    console.log(`  Target:      ${icon} ${chalk.white(cfg.target)} — ${cfg.targetLabel}`);
    console.log(`  Auto-sync:   ${cfg.autoSync ? chalk.green('on') : chalk.dim('off')}`);
    if (cfg.lastSync) {
      console.log(`  Last sync:   ${chalk.dim(cfg.lastSync)}`);
    } else {
      console.log(`  Last sync:   ${chalk.dim('never')}`);
    }
  }
  console.log('');
}

async function setTarget(bm, typeOrArgs, opts) {
  let type, options = {};

  if (typeof typeOrArgs === 'string') {
    type = typeOrArgs;
  } else {
    type = typeOrArgs;
  }

  // Handle: `clawkeep backup local /path`
  if (type === 'local') {
    const targetPath = opts.path || opts.args?.[0];
    if (!targetPath) {
      console.error(chalk.red('  Usage: clawkeep backup local <path>'));
      process.exit(1);
    }
    options.path = targetPath;
  } else if (type === 'git') {
    const url = opts.path || opts.args?.[0];
    if (!url) {
      console.error(chalk.red('  Usage: clawkeep backup git <remote-url>'));
      process.exit(1);
    }
    options.url = url;
  }

  const spinner = ora('Setting up backup target...').start();
  try {
    const cfg = await bm.setTarget(type, options);
    spinner.succeed('Backup target configured');
    console.log(`  Target: ${cfg.target} — ${cfg.targetLabel}`);
    console.log('');

    // Auto-test
    const test = await bm.test();
    if (test.ok) {
      console.log(`  ${chalk.green('✓')} ${test.message}${test.latencyMs ? ` (${test.latencyMs}ms)` : ''}`);
    } else {
      console.log(`  ${chalk.yellow('⚠')} ${test.message}`);
    }
    console.log('');
  } catch (err) {
    spinner.fail('Failed to set target');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doSync(bm) {
  const spinner = ora('Syncing to backup target...').start();
  try {
    const result = await bm.sync();
    spinner.succeed('Synced to backup target');
    if (result.lastSync) {
      console.log(chalk.dim(`  Last sync: ${result.lastSync}`));
    }
  } catch (err) {
    spinner.fail('Sync failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doPull(bm) {
  const spinner = ora('Pulling from backup target...').start();
  try {
    await bm.pull();
    spinner.succeed('Pulled from backup target');
  } catch (err) {
    spinner.fail('Pull failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doTest(bm) {
  const spinner = ora('Testing connection...').start();
  try {
    const result = await bm.test();
    if (result.ok) {
      spinner.succeed(`${result.message}${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`);
    } else {
      spinner.fail(result.message);
    }
  } catch (err) {
    spinner.fail(err.message);
    process.exit(1);
  }
}
