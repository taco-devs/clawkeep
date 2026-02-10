'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const { exec } = require('child_process');
const ClawGit = require('../core/git');
const BackupManager = require('../core/backup');
const { loadCredentials, saveCredentials, clearCredentials } = require('../core/credentials');

const DEFAULT_ENDPOINT = 'https://clawkeep.com';
const CALLBACK_TIMEOUT = 120000;

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
  const endpoint = (opts.endpoint || DEFAULT_ENDPOINT).replace(/\/$/, '');
  const apiKey = opts.apiKey || process.env.CLAWKEEP_API_KEY;
  const workspace = opts.workspace;

  // Headless mode: --api-key and --workspace provided directly
  if (apiKey && workspace) {
    return doHeadlessSetup(dir, apiKey, workspace, endpoint, opts);
  }

  // SSH detection
  if (process.env.SSH_CLIENT && !apiKey) {
    console.log('');
    console.log(chalk.yellow('  Detected SSH session. Browser flow may not work.'));
    console.log(chalk.dim('  Use headless mode instead:'));
    console.log(chalk.dim('  $ clawkeep cloud setup --api-key ck_live_xxx --workspace ws_xxx'));
    console.log('');
    process.exit(1);
  }

  // Browser callback flow
  return doBrowserSetup(dir, endpoint, opts);
}

async function doHeadlessSetup(dir, apiKey, workspace, endpoint, opts) {
  const spinner = ora('Configuring ClawKeep Cloud...').start();
  try {
    // Save global credentials
    saveCredentials({ apiKey, endpoint });

    // Configure project if initialized
    const claw = new ClawGit(dir);
    if (await claw.isInitialized()) {
      const bm = new BackupManager(claw);
      await bm.setTarget('cloud', { workspace, endpoint });

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
    } else {
      spinner.succeed('Credentials saved');
      console.log(chalk.dim('  Run `clawkeep init` in a project directory, then `clawkeep cloud setup` again.'));
    }

    console.log('');
    console.log(`  ${chalk.dim('API Key')}    ${maskKey(apiKey)}`);
    console.log(`  ${chalk.dim('Workspace')}  ${workspace}`);
    console.log(`  ${chalk.dim('Endpoint')}   ${endpoint}`);
    console.log('');
  } catch (err) {
    spinner.fail('Setup failed');
    console.error(chalk.red('  ' + err.message));
    process.exit(1);
  }
}

async function doBrowserSetup(dir, endpoint, opts) {
  const state = crypto.randomBytes(24).toString('hex');

  console.log('');
  console.log(chalk.bold.cyan('  \ud83d\udc3e ClawKeep Cloud Setup'));
  console.log('');

  // Start temporary callback server
  const { port, promise } = await startCallbackServer(state);

  // Build connect URL
  const dirName = path.basename(path.resolve(dir));
  const connectUrl = `${endpoint}/connect?callback_port=${port}&state=${state}&dir_name=${encodeURIComponent(dirName)}`;

  console.log(chalk.dim('  Opening browser...'));
  console.log('');
  console.log(`  ${chalk.dim('If it doesn\'t open, visit:')} `);
  console.log(`  ${chalk.cyan(connectUrl)}`);
  console.log('');

  // Open browser
  openBrowser(connectUrl);

  const spinner = ora('Waiting for browser authorization...').start();

  try {
    const result = await promise;
    spinner.succeed('Authorization received');

    // Save credentials
    saveCredentials({ apiKey: result.apiKey, endpoint });

    // Configure project
    const claw = new ClawGit(dir);
    if (await claw.isInitialized()) {
      const bm = new BackupManager(claw);
      await bm.setTarget('cloud', { workspace: result.workspace, endpoint });

      const password = opts.password || process.env.CLAWKEEP_PASSWORD;
      if (password && !bm.hasPassword()) {
        bm.setPassword(password);
      }

      const test = await bm.test();
      if (test.ok) {
        console.log(`  ${chalk.green('\u2713')} ${test.message}${test.latencyMs ? ` (${test.latencyMs}ms)` : ''}`);
      }

      if (!bm.hasPassword()) {
        console.log('');
        console.log(chalk.yellow('  \u26a0 Set a password before syncing:'));
        console.log(chalk.dim('  $ clawkeep backup set-password'));
      }
    }

    console.log('');
    console.log(`  ${chalk.dim('Workspace')}  ${result.workspace}`);
    console.log('');
  } catch (err) {
    spinner.fail(err.message || 'Setup failed');
    process.exit(1);
  }
}

function startCallbackServer(expectedState) {
  return new Promise((resolveSetup) => {
    let settled = false;

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/callback') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const apiKey = url.searchParams.get('api_key');
      const workspace = url.searchParams.get('workspace');
      const state = url.searchParams.get('state');

      if (state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Error: Invalid state parameter</h2><p>Please try again from the CLI.</p></body></html>');
        return;
      }

      if (!apiKey || !workspace) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<html><body><h2>Error: Missing parameters</h2><p>Please try again from the CLI.</p></body></html>');
        return;
      }

      // Success
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a0a0a;color:#fafafa">
        <div style="text-align:center">
          <h1 style="font-size:3rem;margin-bottom:0.5rem">\u2713</h1>
          <h2>Connected!</h2>
          <p style="color:#888">You can close this tab and return to the terminal.</p>
        </div>
      </body></html>`);

      settled = true;
      server.close();
      resolveResult({ apiKey, workspace });
    });

    let resolveResult;
    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;

      // Timeout
      setTimeout(() => {
        if (!settled) {
          settled = true;
          server.close();
          reject(new Error('Timed out waiting for browser authorization (120s)'));
        }
      }, CALLBACK_TIMEOUT);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolveSetup({ port, promise: resultPromise });
    });
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
