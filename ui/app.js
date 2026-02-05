/* ClawKeep Dashboard — app.js */
'use strict';

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const q = (extra) => '?token=' + TOKEN + (extra ? '&' + extra : '');

async function api(path, params) {
  const res = await fetch('/api/' + path + q(params || ''));
  return res.json();
}

/* Helpers */
function esc(s) {
  if (!s) return '';
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000);
  const h = Math.floor(ms / 3600000);
  const dy = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  if (h < 24) return h + 'h ago';
  if (dy < 30) return dy + 'd ago';
  return new Date(d).toISOString().substring(0, 10);
}

function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

/* Tab navigation */
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    const titles = { overview: 'Overview', timeline: 'Timeline', files: 'Files', diff: 'Changes' };
    $('#page-title').textContent = titles[tab] || tab;
    ['overview', 'timeline', 'files', 'diff'].forEach(id => {
      $('#tab-' + id).classList.toggle('hidden', id !== tab);
    });
    if (tab === 'timeline') loadTimeline();
    if (tab === 'files') loadFiles('.');
    if (tab === 'diff') loadDiff();
  });
});

/* Overview */
async function loadOverview() {
  const data = await api('status');
  const c = data.config, s = data.stats, gs = data.gitStatus;

  // Sidebar agent info
  $('#sidebar-agent').innerHTML =
    '<strong>' + esc(c.agentName) + '</strong><br>' +
    '<span style="color:var(--accent)">' + c.framework + '</span>';

  // Stats
  $('#stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Snapshots</div>
      <div class="stat-value cyan">${s.totalSnaps}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Files</div>
      <div class="stat-value cyan">${s.trackedFiles.toLocaleString()}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Days Active</div>
      <div class="stat-value cyan">${s.daysTracked || '< 1'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Status</div>
      <div class="stat-value ${gs.clean ? 'green' : 'cyan'}">${gs.clean ? '✓' : gs.total}</div>
      <div class="stat-sub">${gs.clean ? 'clean' : 'pending change' + (gs.total > 1 ? 's' : '')}</div>
    </div>
  `;

  // Changes
  if (gs.clean) {
    $('#changes-count').textContent = '';
    $('#changes-body').innerHTML = '<div class="empty-state"><span class="es-icon">✓</span>No pending changes</div>';
  } else {
    $('#changes-count').textContent = gs.total;
    $('#changes-body').innerHTML = (gs.files || []).slice(0, 12).map(f => {
      let cls = 'ch-mod', icon = '~';
      if (f.working_dir === '?' || f.index === '?') { cls = 'ch-add'; icon = '+'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'ch-del'; icon = '−'; }
      return `<div class="change-item"><span class="change-icon ${cls}">${icon}</span><span class="change-path">${esc(f.path)}</span></div>`;
    }).join('') + (gs.total > 12 ? `<div style="font-size:11px;color:var(--t4);padding-top:4px">+ ${gs.total - 12} more</div>` : '');
  }

  // Recent
  const entries = await api('log', 'limit=6');
  $('#recent-body').innerHTML = renderTimeline(entries, true);

  // Update time
  $('#last-updated').textContent = 'Updated ' + new Date().toLocaleTimeString();
}

/* Timeline */
async function loadTimeline() {
  const entries = await api('log', 'limit=100');
  $('#tl-count').textContent = entries.length;
  $('#tl-body').innerHTML = '<div style="padding:4px 0">' + renderTimeline(entries) + '</div>';
}

function renderTimeline(entries, compact) {
  if (!entries || !entries.length) {
    return '<div class="empty-state"><span class="es-icon">◷</span>No snapshots yet</div>';
  }
  return entries.map((e, i) => `
    <div class="tl-item">
      <div class="tl-gutter">
        <div class="tl-dot ${i === 0 ? 'latest' : ''}"></div>
        ${i < entries.length - 1 ? '<div class="tl-stem"></div>' : ''}
      </div>
      <div class="tl-body">
        <div class="tl-row">
          <span class="tl-hash">${e.hash.substring(0, 8)}</span>
          <span class="tl-time">${timeAgo(e.date)}</span>
        </div>
        <div class="tl-msg">${esc(e.message)}</div>
      </div>
    </div>
  `).join('');
}

/* File browser */
let currentPath = '.';

async function loadFiles(p) {
  currentPath = p;
  const files = await api('files', 'path=' + encodeURIComponent(p));

  if (files.error) {
    $('#fb-body').innerHTML = '<div class="empty-state">' + esc(files.error) + '</div>';
    return;
  }

  // Breadcrumb
  const parts = p === '.' ? [{ name: '~', path: '.' }] : [{ name: '~', path: '.' }];
  if (p !== '.') {
    const segs = p.split('/').filter(Boolean);
    let acc = '';
    segs.forEach(s => {
      acc = acc ? acc + '/' + s : s;
      parts.push({ name: s, path: acc });
    });
  }

  $('#fb-breadcrumb').innerHTML = parts.map((pt, i) =>
    `<span onclick="loadFiles('${pt.path.replace(/'/g, "\\'")}')">${esc(pt.name)}</span>` +
    (i < parts.length - 1 ? '<span class="sep">/</span>' : '')
  ).join('');

  // File list
  const rows = [];
  if (p !== '.') {
    const parent = p.split('/').slice(0, -1).join('/') || '.';
    rows.push(`<div class="fb-row" onclick="loadFiles('${parent.replace(/'/g, "\\'")}')">
      <span class="fb-icon">↩</span><span class="fb-name is-dir">..</span></div>`);
  }

  files.forEach(f => {
    if (f.type === 'dir') {
      rows.push(`<div class="fb-row" onclick="loadFiles('${f.path.replace(/'/g, "\\'")}')">
        <span class="fb-icon">📁</span><span class="fb-name is-dir">${esc(f.name)}</span></div>`);
    } else {
      rows.push(`<div class="fb-row" onclick="viewFile('${f.path.replace(/'/g, "\\'")}')">
        <span class="fb-icon">${fileIcon(f.name)}</span>
        <span class="fb-name is-file">${esc(f.name)}</span>
        <span class="fb-meta">${fmtSize(f.size)}</span></div>`);
    }
  });

  $('#fb-body').innerHTML = rows.join('');
  $('#file-viewer').innerHTML = '';
}

function fileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    md: '📝', json: '{}', js: '⚡', ts: '⚡', py: '🐍', yml: '⚙', yaml: '⚙',
    env: '🔒', sh: '⚡', css: '🎨', html: '🌐', txt: '📄', log: '📋',
    png: '🖼', jpg: '🖼', gif: '🖼', svg: '🖼',
  };
  return map[ext] || '📄';
}

async function viewFile(p) {
  const data = await api('file', 'path=' + encodeURIComponent(p));

  if (data.error) {
    $('#file-viewer').innerHTML = `<div class="file-panel"><div class="file-panel-head"><span class="fp-path">${esc(data.error)}</span></div></div>`;
    return;
  }

  if (data.binary) {
    $('#file-viewer').innerHTML = `<div class="file-panel">
      <div class="file-panel-head"><span class="fp-path">${esc(p)}</span><span class="fp-size">${fmtSize(data.size)}</span></div>
      <div class="file-content" style="text-align:center;color:var(--t4)">Binary file — ${fmtSize(data.size)}</div></div>`;
    return;
  }

  $('#file-viewer').innerHTML = `<div class="file-panel">
    <div class="file-panel-head"><span class="fp-path">${esc(p)}</span><span class="fp-size">${fmtSize(data.size)}</span></div>
    <div class="file-content">${esc(data.content)}</div></div>`;
}

/* Diff */
async function loadDiff() {
  const data = await api('diff');
  if (!data.diff || !data.diff.trim()) {
    $('#diff-body').innerHTML = '<div class="empty-state"><span class="es-icon">✓</span>No uncommitted changes</div>';
    return;
  }
  const lines = data.diff.split('\n').map(l => {
    const e = esc(l);
    if (l.startsWith('+') && !l.startsWith('+++')) return '<span class="d-add">' + e + '</span>';
    if (l.startsWith('-') && !l.startsWith('---')) return '<span class="d-del">' + e + '</span>';
    if (l.startsWith('@@')) return '<span class="d-hunk">' + e + '</span>';
    if (l.startsWith('diff ')) return '<span class="d-file">' + e + '</span>';
    return e;
  }).join('\n');
  $('#diff-body').innerHTML = '<div class="diff-content">' + lines + '</div>';
}

/* Actions */
async function refresh() {
  await loadOverview();
}

async function takeSnap() {
  const btn = $('.btn-primary');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span class="btn-icon">⏳</span> Snapping...';
  btn.disabled = true;
  try {
    await api('snap');
    await refresh();
  } catch (e) {
    console.error('Snap failed:', e);
  }
  btn.innerHTML = orig;
  btn.disabled = false;
}

/* Init */
loadOverview();
setInterval(refresh, 30000);
