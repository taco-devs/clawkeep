'use strict';

const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const ClawGit = require('../core/git');
const BackupManager = require('../core/backup');

const PID_FILE = '.clawkeep/watch.pid';

module.exports = async function watch(opts) {
  const dir = path.resolve(opts.dir || '.');
  const interval = parseInt(opts.interval) || 5000;
  const autoPush = opts.push || false;
  const quiet = opts.quiet || false;

  if (opts.stop) return stopDaemon(dir);

  const claw = new ClawGit(dir);

  if (!(await claw.isInitialized())) {
    console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
    process.exit(1);
  }

  if (opts.daemon) return startDaemon(dir, interval, opts);
  startWatcher(claw, dir, interval, autoPush, quiet);
};

function startDaemon(dir, interval, opts) {
  const pidPath = path.join(dir, PID_FILE);
  if (fs.existsSync(pidPath)) {
    const oldPid = parseInt(fs.readFileSync(pidPath, 'utf8'));
    try { process.kill(oldPid, 0); console.log(chalk.yellow(`  Already running (PID ${oldPid}).`)); return; }
    catch { fs.unlinkSync(pidPath); }
  }

  const args = ['watch', '--interval', String(interval), '-d', dir];
  if (opts.push) args.push('--push');
  args.push('-q');

  const binPath = path.join(__dirname, '../../bin/clawkeep.js');
  const child = spawn(process.execPath, [binPath, ...args], {
    detached: true, stdio: 'ignore',
    env: { ...process.env, CLAWKEEP_WATCH_DAEMON: '1' },
  });
  child.unref();
  fs.writeFileSync(pidPath, String(child.pid));

  console.log('');
  console.log(chalk.bold.cyan('  🐾 ClawKeep watching (background)'));
  console.log(`  ${chalk.dim('PID')}       ${child.pid}`);
  console.log(`  ${chalk.dim('Dir')}       ${dir}`);
  console.log(`  ${chalk.dim('Interval')}  ${interval}ms`);
  console.log(`  ${chalk.dim('Stop')}      clawkeep watch --stop`);
  console.log('');
}

function stopDaemon(dir) {
  const pidPath = path.join(dir, PID_FILE);
  if (!fs.existsSync(pidPath)) { console.log(chalk.dim('  No watcher running.')); return; }
  const pid = parseInt(fs.readFileSync(pidPath, 'utf8'));
  try { process.kill(pid, 'SIGTERM'); console.log(chalk.green(`  ✓ Watcher stopped (PID ${pid})`)); }
  catch { console.log(chalk.dim('  Already stopped.')); }
  try { fs.unlinkSync(pidPath); } catch {}
}

function startWatcher(claw, dir, interval, autoPush, quiet) {
  const config = claw.loadConfig();
  const pidPath = path.join(dir, PID_FILE);

  // Write PID file
  fs.writeFileSync(pidPath, String(process.pid));

  if (!quiet) {
    console.log('');
    console.log(chalk.bold.cyan('  🐾 ClawKeep watching...'));
    console.log('');
    console.log(`  ${chalk.dim('Directory')}   ${dir}`);
    console.log(`  ${chalk.dim('Debounce')}    ${interval}ms`);
    console.log(`  ${chalk.dim('Auto-push')}   ${autoPush ? chalk.green('on') : chalk.dim('off')}`);
    console.log('');
    console.log(chalk.dim('  Waiting for changes... (Ctrl+C to stop · --daemon to run in background)'));
    console.log('');
  }

  let debounceTimer = null;
  let changedFiles = new Set();
  let snapCount = 0;

  // Load .clawkeepignore patterns for chokidar + hardcoded essentials
  const clawIgnore = claw._loadIgnorePatterns().map(p => {
    if (p.endsWith('/')) return '**/' + p + '**';
    if (!p.includes('/') && !p.includes('*')) return '**/' + p;
    return '**/' + p;
  });
  const ignored = [
    '**/.git/**',
    '**/.clawkeep/**',
    ...(config.ignore || []),
    ...clawIgnore,
  ];

  const watcher = chokidar.watch(dir, {
    ignored,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
  });

  const doSnap = async () => {
    const files = Array.from(changedFiles);
    changedFiles.clear();
    if (files.length === 0) return;

    try {
      const result = await claw.snap();

      if (result) {
        snapCount++;
        const now = new Date().toISOString().substring(11, 19);
        const hash = chalk.yellow(result.hash.substring(0, 8));

        if (!quiet) {
          console.log(`  ${chalk.dim(now)} ${chalk.green('⬤')} ${hash} ${chalk.dim(result.message)}`);
        }

        if (autoPush && config.remote) {
          try {
            await claw.push();
            if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.blue('↑')} ${chalk.dim('pushed')}`);
          } catch (pushErr) {
            if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.yellow('⚠')} ${chalk.dim('push failed: ' + pushErr.message)}`);
          }
        }

        // Auto-sync to backup target
        if (config.backup && config.backup.autoSync && config.backup.target) {
          try {
            const bm = new BackupManager(claw);
            await bm.sync();
            if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.blue('↑')} ${chalk.dim('synced to ' + (config.backup.targetLabel || config.backup.target))}`);
          } catch (syncErr) {
            if (!quiet) console.log(`  ${chalk.dim(now)} ${chalk.yellow('⚠')} ${chalk.dim('sync failed: ' + syncErr.message)}`);
          }
        }
      }
    } catch (err) {
      if (!quiet) console.error(chalk.red(`  Error: ${err.message}`));
    }
  };

  const onFileChange = (eventType, filePath) => {
    const relative = path.relative(dir, filePath);
    changedFiles.add(relative);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(doSnap, interval);
  };

  watcher.on('add', (p) => onFileChange('add', p));
  watcher.on('change', (p) => onFileChange('change', p));
  watcher.on('unlink', (p) => onFileChange('unlink', p));

  const cleanup = () => {
    if (!quiet) {
      console.log('');
      console.log(chalk.dim(`  Stopped. ${snapCount} backup(s) taken this session.`));
    }
    try { fs.unlinkSync(pidPath); } catch {}
    watcher.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
