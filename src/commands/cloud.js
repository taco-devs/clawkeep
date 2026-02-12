'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const https = require('https');
const http = require('http');
const { exec, spawn } = require('child_process');
const ClawGit = require('../core/git');
const BackupManager = require('../core/backup');
const { loadCredentials, saveCredentials, clearCredentials } = require('../core/credentials');

const DEFAULT_WEB_URL = 'https://clawkeep.com';
const DEFAULT_API_URL = 'https://api.clawkeep.com';
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT = 600000; // 10 minutes (matches KV TTL)

/**
 * Derive web and API URLs from an --endpoint flag.
 * - No flag → defaults
 * - https://clawkeep.com → fix to api.clawkeep.com
 * - https://api.clawkeep.com → derive clawkeep.com
 * - Custom → self-hosted, same URL for both
 */
function deriveUrls(endpoint) {
  if (!endpoint) {
    return { webUrl: DEFAULT_WEB_URL, apiUrl: DEFAULT_API_URL };
  }
  const clean = endpoint.replace(/\/$/, '');
  try {
    const url = new URL(clean);
    // Official domain variants
    if (url.hostname === 'clawkeep.com' || url.hostname === 'www.clawkeep.com') {
      return { webUrl: DEFAULT_WEB_URL, apiUrl: DEFAULT_API_URL };
    }
    if (url.hostname === 'api.clawkeep.com') {
      return { webUrl: DEFAULT_WEB_URL, apiUrl: DEFAULT_API_URL };
    }
    // Self-hosted: use same URL for both
    return { webUrl: clean, apiUrl: clean };
  } catch {
    return { webUrl: clean, apiUrl: clean };
  }
}

module.exports = async function cloud(subcommand, opts) {
  if (!subcommand || subcommand === 'setup') {
    return doSetup(opts);
  } else if (subcommand === 'status') {
    return doStatus(opts);
  } else if (subcommand === 'logout') {
    return doLogout();
  } else {
    console.error(chalk.red(`  Unknown subcommand: ${subcommand}`));
    console.error(chalk.dim('  Usage: clawkeep cloud [setup|status|logout]'));
    process.exit(1);
  }
};

async function doSetup(opts) {
  const dir = path.resolve(opts.dir || '.');
  const { webUrl, apiUrl } = deriveUrls(opts.endpoint);
  const apiKey = opts.apiKey || process.env.CLAWKEEP_API_KEY;
  const workspace = opts.workspace;

  // Headless mode: --api-key and --workspace provided directly
  if (apiKey && workspace) {
    return doHeadlessSetup(dir, apiKey, workspace, apiUrl, opts);
  }

  // Browser polling flow (works everywhere including SSH)
  return doBrowserSetup(dir, webUrl, apiUrl, opts);
}

async function doHeadlessSetup(dir, apiKey, workspace, apiUrl, opts) {
  const spinner = ora('Configuring ClawKeep Cloud...').start();
  try {
    // Auto-init if directory not initialized
    const claw = new ClawGit(dir);
    if (!(await claw.isInitialized())) {
      await claw.init();
      await claw.snap('initial backup');
      spinner.text = 'Initialized and configuring cloud...';
    }

    // Save global credentials
    saveCredentials({ apiKey, endpoint: apiUrl });

    // Configure project
    const bm = new BackupManager(claw);
    await bm.setTarget('cloud', { workspace, endpoint: apiUrl });

    // Set password if provided
    const password = opts.password || process.env.CLAWKEEP_PASSWORD;
    if (password && !bm.hasPassword()) {
      bm.setPassword(password);
    }

    // Test connection
    const test = await bm.test();
    if (test.ok) {
      spinner.succeed('Connected to ClawKeep Cloud');
      console.log(`  ${chalk.green('\u2713')} ${test.message}${test.latencyMs ? ` (${test.latencyMs}ms)` : ''}`);
    } else {
      spinner.warn('Credentials saved but connection test failed');
      console.log(`  ${chalk.yellow('\u26a0')} ${test.message}`);
    }

    console.log('');
    console.log(`  ${chalk.dim('API Key')}    ${maskKey(apiKey)}`);
    console.log(`  ${chalk.dim('Workspace')}  ${workspace}`);
    console.log(`  ${chalk.dim('Endpoint')}   ${apiUrl}`);
    console.log('');

    // Show what's next
    showNextSteps(bm, opts);

    // Auto-start watcher if --watch
    if (opts.watch) {
      startSyncWatcher(dir);
    }
  } catch (err) {
    spinner.fail('Setup failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doBrowserSetup(dir, webUrl, apiUrl, opts) {
  console.log('');
  console.log(chalk.bold.cyan('  \ud83d\udc3e ClawKeep Cloud Setup'));
  console.log('');

  if (process.env.SSH_CLIENT) {
    console.log(chalk.dim('  SSH session detected — polling mode (no localhost needed).'));
    console.log('');
  }

  // Step 1: Create session on API
  const sessionSpinner = ora('Creating connect session...').start();
  let code;
  try {
    const dirName = path.basename(path.resolve(dir));
    const response = await httpPost(`${apiUrl}/api/connect/session`, { dir_name: dirName });
    code = response.code;
    sessionSpinner.succeed(`Session code: ${chalk.bold(code)}`);
  } catch (err) {
    sessionSpinner.fail('Failed to create session');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }

  // Step 2: Open browser
  const dirName = path.basename(path.resolve(dir));
  const connectUrl = `${webUrl}/connect?code=${code}&dir_name=${encodeURIComponent(dirName)}`;

  console.log('');
  console.log(chalk.dim('  Opening browser...'));
  console.log('');
  console.log(`  ${chalk.dim('If it doesn\'t open, visit:')} `);
  console.log(`  ${chalk.cyan(connectUrl)}`);
  console.log('');

  openBrowser(connectUrl);

  // Step 3: Poll for completion
  const pollSpinner = ora('Waiting for browser authorization...').start();

  try {
    const result = await pollForCompletion(apiUrl, code, POLL_TIMEOUT);
    pollSpinner.succeed('Authorization received');

    // Save credentials
    saveCredentials({ apiKey: result.api_key, endpoint: apiUrl });

    // Auto-init if needed
    const claw = new ClawGit(dir);
    if (!(await claw.isInitialized())) {
      await claw.init();
      await claw.snap('initial backup');
    }

    // Configure project
    const bm = new BackupManager(claw);
    await bm.setTarget('cloud', { workspace: result.workspace_id, endpoint: apiUrl });

    // Store wrappedKey + passwordHash if browser derived them
    if (result.wrapped_key && result.password_hash) {
      const config = claw.loadConfig();
      if (!config.backup) config.backup = {};
      config.backup.passwordHash = result.password_hash;
      config.backup.wrappedKey = result.wrapped_key;
      claw.saveConfig(config);
    }

    const password = opts.password || process.env.CLAWKEEP_PASSWORD;
    if (password && !bm.hasPassword()) {
      bm.setPassword(password);
    }

    const test = await bm.test();
    if (test.ok) {
      console.log(`  ${chalk.green('\u2713')} ${test.message}${test.latencyMs ? ` (${test.latencyMs}ms)` : ''}`);
    }

    console.log('');
    console.log(`  ${chalk.dim('Workspace')}  ${result.workspace_id}`);
    console.log('');

    // Show what's next (skip password step if wrappedKey was received from browser)
    showNextSteps(bm, opts);

    // Auto-start watcher if --watch
    if (opts.watch) {
      startSyncWatcher(dir);
    }
  } catch (err) {
    pollSpinner.fail(err.message || 'Setup failed');
    process.exit(1);
  }
}

function showNextSteps(bm, opts) {
  const hasPassword = bm.hasPassword();
  const willWatch = opts.watch;

  if (hasPassword && willWatch) {
    // Everything is set up, nothing more to do
    return;
  }

  console.log(chalk.bold('  What\'s next:'));
  console.log('');

  if (!hasPassword) {
    console.log(`  ${chalk.yellow('1.')} Set an encryption password:`);
    console.log(chalk.dim('     $ clawkeep backup set-password'));
    console.log('');
  }

  if (!willWatch) {
    const step = hasPassword ? '1.' : '2.';
    console.log(`  ${chalk.yellow(step)} Start auto-sync watcher:`);
    console.log(chalk.dim('     $ clawkeep watch --sync --daemon'));
    console.log('');
  }

  if (!hasPassword) {
    console.log(chalk.dim('  Or do it all in one line:'));
    console.log(chalk.dim('  $ clawkeep backup set-password && clawkeep watch --sync --daemon'));
    console.log('');
  }
}

function startSyncWatcher(dir) {
  console.log(chalk.dim('  Starting background watcher with --sync...'));

  const binPath = path.join(__dirname, '../../bin/clawkeep.js');
  const args = ['watch', '--sync', '--daemon', '-d', dir];

  const child = spawn(process.execPath, [binPath, ...args], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  console.log(`  ${chalk.green('\u2713')} Watcher started (PID ${child.pid})`);
  console.log(chalk.dim('  Stop with: clawkeep watch --stop'));
  console.log('');
}

// ── HTTP helpers (zero deps) ─────────────────────────────────────────

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid response from server (HTTP ${res.statusCode})`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
    req.write(data);
    req.end();
  });
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const req = mod.request({
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
    }, (res) => {
      let buf = '';
      res.on('data', (chunk) => buf += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(buf);
          if (res.statusCode >= 400) {
            reject(new Error(json.error?.message || `HTTP ${res.statusCode}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid response from server (HTTP ${res.statusCode})`));
        }
      });
    });

    req.on('error', (err) => reject(new Error(`Connection failed: ${err.message}`)));
    req.end();
  });
}

function pollForCompletion(apiUrl, code, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const poll = async () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error('Timed out waiting for browser authorization (10m)'));
        return;
      }

      try {
        const result = await httpGet(`${apiUrl}/api/connect/poll/${code}`);
        if (result.status === 'completed') {
          resolve(result);
          return;
        }
      } catch (err) {
        // Session expired or other error
        if (err.message.includes('not found') || err.message.includes('expired')) {
          reject(new Error('Session expired. Please try again.'));
          return;
        }
        // Network errors are transient, keep polling
      }

      setTimeout(poll, POLL_INTERVAL);
    };

    poll();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else if (platform === 'win32') {
    cmd = `start "" "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, () => {});
}

async function doStatus(opts) {
  const creds = loadCredentials();
  const dir = path.resolve(opts.dir || '.');

  console.log('');
  console.log(chalk.bold('  ClawKeep Cloud'));
  console.log('');

  if (!creds) {
    console.log(`  ${chalk.yellow('\u25cf')} Not connected`);
    console.log('');
    console.log(chalk.dim('  Run: clawkeep cloud setup'));
    console.log('');
    return;
  }

  console.log(`  ${chalk.dim('API Key')}    ${maskKey(creds.apiKey)}`);
  console.log(`  ${chalk.dim('Endpoint')}   ${creds.endpoint}`);

  // Show project-level info if initialized
  try {
    const claw = new ClawGit(dir);
    if (await claw.isInitialized()) {
      const bm = new BackupManager(claw);
      const cfg = bm.getConfig();
      if (cfg.target === 'cloud') {
        console.log(`  ${chalk.dim('Workspace')}  ${cfg.workspaceId}`);
        console.log(`  ${chalk.dim('Last sync')}  ${cfg.lastSync || 'never'}`);
        console.log(`  ${chalk.dim('Encrypted')}  ${cfg.passwordSet ? chalk.green('\u2713 yes') : chalk.yellow('\u26a0 no password set')}`);
      } else {
        console.log('');
        console.log(chalk.dim('  This project is not targeting cloud. Run `clawkeep cloud setup` in this directory.'));
      }
    }
  } catch {
    // Not initialized, just show global info
  }
  console.log('');
}

async function doLogout() {
  clearCredentials();
  console.log('');
  console.log(chalk.green('  \u2713 Logged out of ClawKeep Cloud'));
  console.log(chalk.dim('  Credentials removed. Project backup configs unchanged.'));
  console.log('');
}

function maskKey(key) {
  if (!key) return chalk.dim('none');
  if (key.length <= 12) return key.slice(0, 4) + '***';
  return key.slice(0, 12) + '***' + key.slice(-4);
}
