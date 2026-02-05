'use strict';

const http = require('http');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const ClawGit = require('../core/git');

const PID_FILE = '.clawkeep/ui.pid';
const TOKEN_FILE = '.clawkeep/ui.token';
const UI_DIR = path.join(__dirname, '../../ui');

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

module.exports = async function ui(opts) {
  const dir = path.resolve(opts.dir || '.');
  const port = parseInt(opts.port) || 3333;

  if (opts.stop) return stopDaemon(dir);

  const claw = new ClawGit(dir);
  if (!(await claw.isInitialized())) {
    console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
    process.exit(1);
  }

  // Auth token
  const tokenPath = path.join(dir, TOKEN_FILE);
  let token;
  if (fs.existsSync(tokenPath)) {
    token = fs.readFileSync(tokenPath, 'utf8').trim();
  } else {
    token = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(tokenPath, token);
  }

  if (opts.daemon) return startDaemon(dir, port, opts);
  startServer(claw, dir, port, token, opts);
};

function startDaemon(dir, port, opts) {
  const pidPath = path.join(dir, PID_FILE);
  if (fs.existsSync(pidPath)) {
    const oldPid = parseInt(fs.readFileSync(pidPath, 'utf8'));
    try { process.kill(oldPid, 0); console.log(chalk.yellow(`  Already running (PID ${oldPid}).`)); return; }
    catch { fs.unlinkSync(pidPath); }
  }

  const binPath = path.join(__dirname, '../../bin/clawkeep.js');
  const child = spawn(process.execPath, [binPath, 'ui', '--port', String(port), '-d', dir], {
    detached: true, stdio: 'ignore',
    env: { ...process.env, CLAWKEEP_DAEMON: '1' },
  });
  child.unref();
  fs.writeFileSync(pidPath, String(child.pid));

  const tokenPath = path.join(dir, TOKEN_FILE);
  const token = fs.readFileSync(tokenPath, 'utf8').trim();

  console.log('');
  console.log(chalk.bold.cyan('  🐾 ClawKeep Dashboard (background)'));
  console.log(`  ${chalk.dim('URL')}   http://localhost:${port}/?token=${token}`);
  console.log(`  ${chalk.dim('Stop')}  clawkeep ui --stop`);
  console.log('');
}

function stopDaemon(dir) {
  const pidPath = path.join(dir, PID_FILE);
  if (!fs.existsSync(pidPath)) { console.log(chalk.dim('  No daemon running.')); return; }
  const pid = parseInt(fs.readFileSync(pidPath, 'utf8'));
  try { process.kill(pid, 'SIGTERM'); console.log(chalk.green(`  ✓ Stopped (PID ${pid})`)); }
  catch { console.log(chalk.dim('  Already stopped.')); }
  try { fs.unlinkSync(pidPath); } catch {}
}

function startServer(claw, dir, port, token, opts) {
  function auth(req) {
    const url = new URL(req.url, `http://localhost:${port}`);
    return (url.searchParams.get('token') || req.headers['x-clawkeep-token']) === token;
  }

  const apiHandlers = {
    'status': async () => {
      const config = claw.loadConfig();
      const stats = await claw.getStats();
      const gitStatus = await claw.status();
      return { config, stats, gitStatus };
    },
    'log': async (p) => await claw.log(parseInt(p.get('limit')) || 50),
    'diff': async () => ({ diff: await claw.diff(false) }),
    'snap': async () => (await claw.snap()) || { message: 'No changes' },
    'files': async (p) => listFiles(dir, p.get('path') || '.'),
    'file': async (p) => readFile(dir, p.get('path')),
    'commit': async (p) => await claw.showCommit(p.get('hash') || 'HEAD'),
    'commit/diff': async (p) => ({ diff: await claw.commitDiff(p.get('hash') || 'HEAD') }),
    'file-history': async (p) => await claw.fileHistory(p.get('path') || '.'),
    'files-at': async (p) => await claw.listFilesAtCommit(p.get('hash') || 'HEAD', p.get('path') || ''),
    'file-at': async (p) => await claw.showFileAtCommit(p.get('hash') || 'HEAD', p.get('path')),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // Allow static assets without auth (CSS, JS, images)
    const isStatic = /\.(css|js|png|svg|ico|woff2?)$/i.test(url.pathname);

    if (!isStatic && !auth(req)) {
      res.setHeader('Content-Type', 'text/html');
      res.end(authPage());
      return;
    }

    // API (requires auth)
    if (url.pathname.startsWith('/api/')) {
      if (!auth(req)) {
        res.statusCode = 401;
        res.end('{"error":"unauthorized"}');
        return;
      }
      const route = url.pathname.replace('/api/', '');
      res.setHeader('Content-Type', 'application/json');
      try {
        const handler = apiHandlers[route];
        if (handler) {
          res.end(JSON.stringify(await handler(url.searchParams)));
        } else {
          res.statusCode = 404;
          res.end('{"error":"not found"}');
        }
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Static files from ui/
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(UI_DIR, filePath);

    // Security: no directory traversal
    if (!fullPath.startsWith(UI_DIR)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const ext = path.extname(fullPath);
      res.setHeader('Content-Type', MIME[ext] || 'text/plain');
      // Append token to inline requests
      let content = fs.readFileSync(fullPath);
      res.end(content);
    } else {
      // Fallback to index.html for SPA
      res.setHeader('Content-Type', 'text/html');
      res.end(fs.readFileSync(path.join(UI_DIR, 'index.html')));
    }
  });

  const host = opts.host || '0.0.0.0';
  server.listen(port, host, () => {
    const pidPath = path.join(dir, PID_FILE);
    fs.writeFileSync(pidPath, String(process.pid));

    if (!process.env.CLAWKEEP_DAEMON) {
      console.log('');
      console.log(chalk.bold.cyan('  🐾 ClawKeep Dashboard'));
      console.log('');
      console.log(`  ${chalk.dim('URL')}     ${chalk.white(`http://localhost:${port}/?token=${token}`)}`);
      console.log(`  ${chalk.dim('Auth')}    ${chalk.green('✓ token required')}`);
      console.log('');
      console.log(chalk.dim('  Ctrl+C to stop · --daemon to run in background'));
      console.log('');
    }
  });

  const cleanup = () => {
    try { fs.unlinkSync(path.join(dir, PID_FILE)); } catch {}
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function listFiles(baseDir, subdir) {
  const fullPath = path.resolve(baseDir, subdir);
  if (!fullPath.startsWith(path.resolve(baseDir))) return { error: 'Access denied' };
  if (!fs.existsSync(fullPath)) return { error: 'Not found' };

  return fs.readdirSync(fullPath, { withFileTypes: true })
    .filter(e => !e.name.startsWith('.git') && e.name !== 'node_modules' && e.name !== '.clawkeep')
    .map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      path: path.join(subdir, e.name).replace(/\\/g, '/'),
      size: e.isFile() ? fs.statSync(path.join(fullPath, e.name)).size : null,
    }))
    .sort((a, b) => a.type !== b.type ? (a.type === 'dir' ? -1 : 1) : a.name.localeCompare(b.name));
}

function readFile(baseDir, filePath) {
  if (!filePath) return { error: 'path required' };
  const fullPath = path.resolve(baseDir, filePath);
  if (!fullPath.startsWith(path.resolve(baseDir))) return { error: 'Access denied' };
  if (!fs.existsSync(fullPath)) return { error: 'Not found' };

  const stats = fs.statSync(fullPath);
  if (stats.size > 512 * 1024) return { error: 'File too large', size: stats.size };

  const ext = path.extname(filePath).toLowerCase();
  const binary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.db', '.enc', '.gz', '.zip', '.tar'].includes(ext);
  if (binary) return { path: filePath, size: stats.size, binary: true, content: null };

  return { path: filePath, size: stats.size, binary: false, content: fs.readFileSync(fullPath, 'utf8') };
}

function authPage() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ClawKeep</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#06080c;color:#f1f5f9;font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{text-align:center;padding:40px;border:1px solid #1e2a3a;border-radius:12px;background:#111820;width:340px}
h1{font-size:18px;margin-bottom:4px;font-weight:600}h1 span{color:#38bdf8}
p{color:#6b7b8e;font-size:12px;margin-bottom:20px}
input{background:#0c1017;border:1px solid #1e2a3a;color:#f1f5f9;padding:9px 14px;border-radius:6px;width:100%;font-size:13px;margin-bottom:10px}
input:focus{outline:none;border-color:#38bdf8}
button{background:#38bdf8;color:#06080c;border:none;padding:9px;border-radius:6px;font-weight:600;cursor:pointer;width:100%;font-size:13px}
button:hover{filter:brightness(1.1)}</style></head>
<body><div class="card"><h1>🐾 <span>ClawKeep</span></h1><p>Enter your access token</p>
<form onsubmit="event.preventDefault();location.href='/?token='+document.getElementById('t').value">
<input id="t" type="password" placeholder="Token" autofocus>
<button type="submit">Open Dashboard</button></form></div></body></html>`;
}
