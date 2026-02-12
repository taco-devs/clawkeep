'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');
const BackupManager = require('../core/backup');

module.exports = async function backup(subcommand, args, opts) {
  // Restore doesn't need an initialized repo — it creates a new one
  if (subcommand === 'restore') {
    return doRestore(args, opts);
  }

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
  } else if (subcommand === 'set-password') {
    return doSetPassword(bm, opts);
  } else if (subcommand === 'sync') {
    return doSync(bm, opts);
  } else if (subcommand === 'pull') {
    return doPull(bm);
  } else if (subcommand === 'test') {
    return doTest(bm);
  } else if (subcommand === 'compact') {
    return doCompact(bm, opts);
  } else {
    // Treat subcommand as target type shorthand: `clawkeep backup local /path`
    return setTarget(bm, subcommand, opts);
  }
};

function getPassword(opts) {
  return opts.password || process.env.CLAWKEEP_PASSWORD || null;
}

async function showStatus(bm) {
  const cfg = bm.getConfig();
  console.log('');
  console.log(chalk.bold('  Backup Status'));
  console.log('');

  if (!cfg.target) {
    console.log(`  ${chalk.yellow('\u25cf')} No backup target configured`);
    console.log('');
    console.log(chalk.dim('  Set one up:'));
    console.log(chalk.dim('  $ clawkeep backup local /path/to/backup'));
    console.log(chalk.dim('  $ clawkeep backup git <remote-url>'));
  } else {
    const icon = { local: '\ud83d\udcc1', cloud: '\ud83d\udc3e', s3: '\ud83e\udea3', git: '\ud83d\udd17' }[cfg.target] || '?';
    console.log(`  Target:      ${icon} ${chalk.white(cfg.target)} \u2014 ${cfg.targetLabel}`);
    console.log(`  Auto-sync:   ${cfg.autoSync ? chalk.green('on') : chalk.dim('off')}`);
    if (cfg.lastSync) {
      console.log(`  Last sync:   ${chalk.dim(cfg.lastSync)}`);
    } else {
      console.log(`  Last sync:   ${chalk.dim('never')}`);
    }

    // Encryption status
    if (cfg.target === 'local' || cfg.target === 's3' || cfg.target === 'cloud') {
      console.log(`  Encrypted:   ${cfg.passwordSet ? chalk.green('\u2713 yes') : chalk.yellow('\u26a0 password not set')}`);
      if (cfg.chunkCount > 0) {
        console.log(`  Chunks:      ${cfg.chunkCount}`);
      }
      if (cfg.workspaceId) {
        console.log(`  Workspace:   ${chalk.dim(cfg.workspaceId)}`);
      }
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
  } else if (type === 's3') {
    const endpoint = opts.endpoint || process.env.CLAWKEEP_S3_ENDPOINT;
    const bucket = opts.bucket || process.env.CLAWKEEP_S3_BUCKET;
    const accessKey = opts.accessKey || process.env.CLAWKEEP_S3_ACCESS_KEY;
    const secretKey = opts.secretKey || process.env.CLAWKEEP_S3_SECRET_KEY;
    const region = opts.region || process.env.CLAWKEEP_S3_REGION || 'auto';
    const prefix = opts.prefix || process.env.CLAWKEEP_S3_PREFIX || '';

    if (!endpoint || !bucket || !accessKey || !secretKey) {
      console.error(chalk.red('  Missing S3 config. Required: --endpoint, --bucket, --access-key, --secret-key'));
      console.error(chalk.dim('  Or use env vars: CLAWKEEP_S3_ENDPOINT, CLAWKEEP_S3_BUCKET, CLAWKEEP_S3_ACCESS_KEY, CLAWKEEP_S3_SECRET_KEY'));
      process.exit(1);
    }

    options = { endpoint, bucket, accessKey, secretKey, region, prefix };
  }

  const spinner = ora('Setting up backup target...').start();
  try {
    const cfg = await bm.setTarget(type, options);
    spinner.succeed('Backup target configured');
    console.log(`  Target: ${cfg.target} \u2014 ${cfg.targetLabel}`);
    console.log('');

    // Auto-test
    const test = await bm.test();
    if (test.ok) {
      console.log(`  ${chalk.green('\u2713')} ${test.message}${test.latencyMs ? ` (${test.latencyMs}ms)` : ''}`);
    } else {
      console.log(`  ${chalk.yellow('\u26a0')} ${test.message}`);
    }

    // Remind about password for encrypted targets
    if ((type === 'local' || type === 's3' || type === 'cloud') && !bm.hasPassword()) {
      console.log('');
      console.log(chalk.yellow('  \u26a0 Set a password before syncing:'));
      console.log(chalk.dim('  $ clawkeep backup set-password'));
      console.log(chalk.dim('  or: CLAWKEEP_PASSWORD=xxx clawkeep backup set-password'));
    }
    console.log('');
  } catch (err) {
    spinner.fail('Failed to set target');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doSetPassword(bm, opts) {
  const password = getPassword(opts);
  if (!password) {
    console.error(chalk.red('  Password required.'));
    console.error(chalk.dim('  Use: CLAWKEEP_PASSWORD=xxx clawkeep backup set-password'));
    console.error(chalk.dim('  Or:  clawkeep backup set-password -p <password>'));
    process.exit(1);
  }

  const spinner = ora('Setting encryption password...').start();
  try {
    bm.setPassword(password);
    spinner.succeed('Encryption password set');
    console.log(chalk.dim('  Password hash + wrapped key stored (password itself is never saved)'));
    console.log(chalk.dim('  Keyless sync enabled — no CLAWKEEP_PASSWORD needed for daemon'));
  } catch (err) {
    spinner.fail('Failed to set password');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doSync(bm, opts) {
  const cfg = bm.getConfig();
  const needsPassword = cfg.target === 'local' || cfg.target === 's3' || cfg.target === 'cloud';
  const password = needsPassword ? getPassword(opts) : null;

  if (needsPassword && !password && !cfg.wrappedKeySet) {
    console.error(chalk.red('  Password required for encrypted sync.'));
    console.error(chalk.dim('  Use: CLAWKEEP_PASSWORD=xxx clawkeep backup sync'));
    console.error(chalk.dim('  Or run `clawkeep backup set-password` first for keyless sync.'));
    process.exit(1);
  }

  const spinner = ora('Syncing to backup target...').start();
  try {
    const result = await bm.sync(password);
    if (result.synced === false) {
      spinner.succeed(result.message || 'Already up to date');
    } else {
      spinner.succeed('Synced to backup target');
      if (result.chunkCount) {
        console.log(chalk.dim(`  Chunks: ${result.chunkCount} \u2022 Size: ${fmtSize(result.totalSize || 0)}`));
      }
    }
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

async function doCompact(bm, opts) {
  const cfg = bm.getConfig();
  const password = getPassword(opts);
  if (!password && !cfg.wrappedKeySet) {
    console.error(chalk.red('  Password required for compact.'));
    console.error(chalk.dim('  Use: CLAWKEEP_PASSWORD=xxx clawkeep backup compact'));
    console.error(chalk.dim('  Or run `clawkeep backup set-password` first for keyless compact.'));
    process.exit(1);
  }

  const spinner = ora('Compacting backup chunks...').start();
  try {
    const result = await bm.compact(password);
    if (result.compacted === false) {
      spinner.succeed(result.message || 'Nothing to compact');
    } else {
      spinner.succeed(`Compacted ${result.oldChunks} chunks into 1`);
      console.log(chalk.dim(`  New size: ${fmtSize(result.newSize || 0)}`));
    }
  } catch (err) {
    spinner.fail('Compact failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doRestore(args, opts) {
  const sourcePath = opts.path || (args && args[0]);
  if (!sourcePath) {
    console.error(chalk.red('  Usage: clawkeep backup restore <backup-path> -d <dest>'));
    process.exit(1);
  }

  const password = getPassword(opts);
  if (!password) {
    console.error(chalk.red('  Password required for restore.'));
    console.error(chalk.dim('  Use: CLAWKEEP_PASSWORD=xxx clawkeep backup restore <path>'));
    process.exit(1);
  }

  const destDir = path.resolve(opts.dir || '.');
  const spinner = ora('Restoring from encrypted backup...').start();
  try {
    const result = await BackupManager.restoreFromBackup(sourcePath, destDir, password);
    spinner.succeed('Restored from backup');
    console.log(chalk.dim(`  Chunks: ${result.chunks} \u2022 Commits: ${result.totalCommits}`));
    console.log(chalk.dim(`  Restored to: ${destDir}`));
  } catch (err) {
    spinner.fail('Restore failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

function fmtSize(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}
