'use strict';

const http = require('http');
const chalk = require('chalk');
const path = require('path');
const ClawGit = require('../core/git');

module.exports = async function ui(opts) {
  const dir = path.resolve(opts.dir || '.');
  const port = parseInt(opts.port) || 3333;

  const claw = new ClawGit(dir);
  if (!(await claw.isInitialized())) {
    console.error(chalk.red('Not initialized. Run `clawkeep init` first.'));
    process.exit(1);
  }

  // API handlers
  const api = {
    '/api/status': async () => {
      const config = claw.loadConfig();
      const stats = await claw.getStats();
      const gitStatus = await claw.status();
      return { config, stats, gitStatus };
    },
    '/api/log': async (params) => {
      const limit = parseInt(params.get('limit')) || 50;
      return await claw.log(limit);
    },
    '/api/diff': async () => {
      return { diff: await claw.diff(false) };
    },
    '/api/diff/stat': async () => {
      return { diff: await claw.diff(true) };
    },
    '/api/snap': async () => {
      const result = await claw.snap();
      return result || { message: 'No changes to snapshot' };
    },
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      try {
        const handler = api[pathname];
        if (handler) {
          const data = await handler(url.searchParams);
          res.end(JSON.stringify(data));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    // Serve dashboard
    res.setHeader('Content-Type', 'text/html');
    res.end(getDashboardHTML());
  });

  server.listen(port, () => {
    console.log('');
    console.log(chalk.bold.cyan('  🐾 ClawKeep Dashboard'));
    console.log('');
    console.log(`  ${chalk.dim('URL')}   ${chalk.white(`http://localhost:${port}`)}`);
    console.log(`  ${chalk.dim('Agent')} ${chalk.white(claw.loadConfig()?.agentName || 'unknown')}`);
    console.log('');
    console.log(chalk.dim('  Press Ctrl+C to stop'));
    console.log('');
  });

  process.on('SIGINT', () => {
    server.close();
    process.exit(0);
  });
};

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ClawKeep Dashboard</title>
<style>
  :root {
    --bg: #0d1117;
    --surface: #161b22;
    --border: #30363d;
    --text: #e6edf3;
    --text-dim: #7d8590;
    --accent: #58a6ff;
    --green: #3fb950;
    --red: #f85149;
    --yellow: #d29922;
    --purple: #bc8cff;
    --cyan: #39d2c0;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.5;
  }
  .container { max-width: 1000px; margin: 0 auto; padding: 24px; }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 32px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }
  .header h1 { font-size: 24px; font-weight: 600; }
  .header h1 span { color: var(--cyan); }
  .header-actions { display: flex; gap: 8px; }
  .btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    transition: border-color 0.15s;
  }
  .btn:hover { border-color: var(--accent); }
  .btn-primary { background: var(--accent); color: #000; border-color: var(--accent); font-weight: 600; }
  .btn-primary:hover { opacity: 0.9; }

  /* Cards */
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
  @media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
  }
  .card-title {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-dim);
    margin-bottom: 12px;
  }
  .stat { font-size: 32px; font-weight: 700; color: var(--cyan); }
  .stat-label { font-size: 13px; color: var(--text-dim); }
  .stat-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
  .stat-sm { font-size: 20px; font-weight: 600; }

  /* Agent Info */
  .info-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; }
  .info-label { color: var(--text-dim); font-size: 13px; }
  .info-value { font-size: 13px; }
  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }
  .badge-green { background: rgba(63,185,80,0.15); color: var(--green); }
  .badge-yellow { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .badge-blue { background: rgba(88,166,255,0.15); color: var(--accent); }

  /* Timeline */
  .timeline-section { margin-bottom: 24px; }
  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
  }
  .section-title { font-size: 16px; font-weight: 600; }
  .timeline { position: relative; }
  .timeline-item {
    display: flex;
    gap: 16px;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    transition: background 0.1s;
    cursor: pointer;
    padding-left: 8px;
    margin-left: 8px;
    border-left: 2px solid var(--border);
  }
  .timeline-item:hover {
    background: rgba(88,166,255,0.04);
  }
  .timeline-item:last-child { border-bottom: none; }
  .timeline-item.active { border-left-color: var(--cyan); }
  .tl-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    background: var(--border);
    margin-top: 6px;
    flex-shrink: 0;
    margin-left: -14px;
  }
  .tl-dot.latest { background: var(--green); }
  .tl-content { flex: 1; min-width: 0; }
  .tl-hash { font-family: 'SF Mono', Consolas, monospace; color: var(--yellow); font-size: 13px; }
  .tl-msg { font-size: 14px; margin-top: 2px; }
  .tl-date { font-size: 12px; color: var(--text-dim); }

  /* Diff viewer */
  .diff-section { margin-bottom: 24px; }
  .diff-viewer {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }
  .diff-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-size: 13px;
    color: var(--text-dim);
  }
  .diff-content {
    padding: 12px 16px;
    font-family: 'SF Mono', Consolas, monospace;
    font-size: 12px;
    line-height: 1.6;
    overflow-x: auto;
    max-height: 500px;
    overflow-y: auto;
    white-space: pre;
  }
  .diff-content .add { color: var(--green); }
  .diff-content .del { color: var(--red); }
  .diff-content .hunk { color: var(--purple); }
  .diff-content .file { color: var(--accent); font-weight: 600; }
  .diff-empty { padding: 40px; text-align: center; color: var(--text-dim); }

  /* Changes */
  .change-list { list-style: none; }
  .change-item {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0; font-size: 13px;
  }
  .change-icon { font-family: monospace; font-weight: 700; width: 16px; text-align: center; }
  .change-add { color: var(--green); }
  .change-mod { color: var(--yellow); }
  .change-del { color: var(--red); }
  .change-path { color: var(--text-dim); }

  .loading { text-align: center; padding: 40px; color: var(--text-dim); }
  .empty { text-align: center; padding: 40px; color: var(--text-dim); }
  .footer { text-align: center; padding: 24px; color: var(--text-dim); font-size: 12px; }
  .footer a { color: var(--cyan); text-decoration: none; }
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🐾 <span>ClawKeep</span></h1>
    <div class="header-actions">
      <button class="btn" onclick="refresh()">↻ Refresh</button>
      <button class="btn btn-primary" onclick="takeSnap()">📸 Snap</button>
    </div>
  </div>

  <div id="agent-info"></div>
  <div id="stats-grid" class="grid"></div>

  <div class="diff-section">
    <div class="section-header">
      <span class="section-title">📝 Pending Changes</span>
    </div>
    <div id="changes-panel"></div>
  </div>

  <div class="timeline-section">
    <div class="section-header">
      <span class="section-title">📋 Snapshot Timeline</span>
    </div>
    <div id="timeline"></div>
  </div>

  <div class="diff-section">
    <div class="section-header">
      <span class="section-title">🔍 Current Diff</span>
    </div>
    <div id="diff-viewer"></div>
  </div>

  <div class="footer">
    <a href="https://clawkeep.com">clawkeep.com</a> — git-backed memory persistence for AI agents
  </div>
</div>

<script>
const API = '';

async function fetchJSON(path) {
  const res = await fetch(API + path);
  return res.json();
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const ms = now - d;
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  if (hours < 24) return hours + 'h ago';
  if (days < 30) return days + 'd ago';
  return d.toISOString().substring(0, 10);
}

async function loadStatus() {
  const data = await fetchJSON('/api/status');
  const c = data.config;
  const s = data.stats;
  const gs = data.gitStatus;

  document.getElementById('agent-info').innerHTML = \`
    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Agent</div>
      <div class="info-grid">
        <span class="info-label">Name</span>
        <span class="info-value">\${c.agentName}</span>
        <span class="info-label">Framework</span>
        <span class="info-value"><span class="badge badge-blue">\${c.framework}</span></span>
        <span class="info-label">Secrets</span>
        <span class="info-value">\${c.trackSecrets
          ? '<span class="badge badge-green">tracked</span>'
          : '<span class="badge badge-yellow">excluded</span>'}</span>
        <span class="info-label">Remote</span>
        <span class="info-value">\${c.remote || '<span style="color:var(--text-dim)">not configured</span>'}</span>
      </div>
    </div>
  \`;

  document.getElementById('stats-grid').innerHTML = \`
    <div class="card">
      <div class="card-title">Snapshots</div>
      <div class="stat">\${s.totalSnaps}</div>
      <div class="stat-label">total snapshots taken</div>
    </div>
    <div class="card">
      <div class="card-title">Tracking</div>
      <div class="stat-row">
        <div><span class="stat-sm">\${s.trackedFiles}</span> <span class="stat-label">files</span></div>
        <div><span class="stat-sm">\${s.daysTracked || '< 1'}</span> <span class="stat-label">days</span></div>
      </div>
      <div class="stat-label">last snap: \${s.lastSnap ? timeAgo(s.lastSnap) : 'never'}</div>
    </div>
  \`;

  // Changes panel
  if (gs.clean) {
    document.getElementById('changes-panel').innerHTML = '<div class="empty">✓ No pending changes</div>';
  } else {
    const items = (gs.files || []).slice(0, 20).map(f => {
      let cls = 'change-mod', icon = '~';
      if (f.working_dir === '?' || f.index === '?') { cls = 'change-add'; icon = '+'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'change-del'; icon = '-'; }
      return \`<li class="change-item"><span class="change-icon \${cls}">\${icon}</span><span class="change-path">\${f.path}</span></li>\`;
    }).join('');
    document.getElementById('changes-panel').innerHTML = \`
      <div class="card"><ul class="change-list">\${items}</ul></div>
    \`;
  }
}

async function loadTimeline() {
  const entries = await fetchJSON('/api/log?limit=50');
  if (!entries.length) {
    document.getElementById('timeline').innerHTML = '<div class="empty">No snapshots yet</div>';
    return;
  }
  const html = entries.map((e, i) => \`
    <div class="timeline-item \${i === 0 ? 'active' : ''}">
      <div class="tl-dot \${i === 0 ? 'latest' : ''}"></div>
      <div class="tl-content">
        <div style="display:flex;justify-content:space-between;align-items:baseline">
          <span class="tl-hash">\${e.hash.substring(0, 8)}</span>
          <span class="tl-date">\${timeAgo(e.date)}</span>
        </div>
        <div class="tl-msg">\${escapeHtml(e.message)}</div>
      </div>
    </div>
  \`).join('');
  document.getElementById('timeline').innerHTML = '<div class="timeline">' + html + '</div>';
}

async function loadDiff() {
  const data = await fetchJSON('/api/diff');
  const container = document.getElementById('diff-viewer');
  if (!data.diff || !data.diff.trim()) {
    container.innerHTML = '<div class="diff-viewer"><div class="diff-empty">No changes since last snapshot</div></div>';
    return;
  }
  const lines = data.diff.split('\\n').map(line => {
    const esc = escapeHtml(line);
    if (line.startsWith('+') && !line.startsWith('+++')) return '<span class="add">' + esc + '</span>';
    if (line.startsWith('-') && !line.startsWith('---')) return '<span class="del">' + esc + '</span>';
    if (line.startsWith('@@')) return '<span class="hunk">' + esc + '</span>';
    if (line.startsWith('diff ')) return '<span class="file">' + esc + '</span>';
    return esc;
  }).join('\\n');
  container.innerHTML = \`
    <div class="diff-viewer">
      <div class="diff-header">Changes since last snapshot</div>
      <div class="diff-content">\${lines}</div>
    </div>
  \`;
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function refresh() {
  await Promise.all([loadStatus(), loadTimeline(), loadDiff()]);
}

async function takeSnap() {
  const btn = document.querySelector('.btn-primary');
  btn.textContent = '⏳ Snapping...';
  btn.disabled = true;
  try {
    const result = await fetchJSON('/api/snap');
    await refresh();
  } catch (e) {
    alert('Snap failed: ' + e.message);
  }
  btn.textContent = '📸 Snap';
  btn.disabled = false;
}

// Auto-refresh every 30s
refresh();
setInterval(refresh, 30000);
</script>
</body>
</html>`;
}
