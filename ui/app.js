/* ClawKeep Dashboard — v3 UX-first */
'use strict';

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const q = (extra) => '?token=' + TOKEN + (extra ? '&' + extra : '');
async function api(path, params) {
  const res = await fetch('/api/' + path + q(params || ''));
  return res.json();
}

/* Helpers */
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function esc(s) { return !s ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60000), h = Math.floor(ms / 3600000), dy = Math.floor(ms / 86400000);
  if (m < 1) return 'just now';
  if (m === 1) return '1 min ago';
  if (m < 60) return m + ' min ago';
  if (h === 1) return '1 hour ago';
  if (h < 24) return h + ' hours ago';
  if (dy === 1) return 'yesterday';
  if (dy < 7) return dy + ' days ago';
  return new Date(d).toLocaleDateString();
}

function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function fmtNum(n) { return n != null ? n.toLocaleString() : '—'; }

/* Toast notifications */
function toast(msg, type = 'info') {
  let container = $('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 3000);
}

/* Simple markdown renderer */
function renderMarkdown(text) {
  let html = esc(text);
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  // HR
  html = html.replace(/^---$/gm, '<hr>');
  // Tables (basic)
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    if (cells.every(c => /^[-:]+$/.test(c))) return '';
    const tag = 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';
  html = html.replace(/<p><(h[123]|pre|ul|ol|blockquote|table|hr)/g, '<$1');
  html = html.replace(/<\/(h[123]|pre|ul|ol|blockquote|table)><\/p>/g, '</$1>');
  return html;
}

/* Tab navigation */
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    const titles = { overview: 'Overview', timeline: 'Timeline', files: 'Files', diff: 'Changes' };
    $('#page-title').textContent = titles[tab] || tab;
    ['overview', 'timeline', 'files', 'diff'].forEach(id =>
      $('#tab-' + id).classList.toggle('hidden', id !== tab)
    );
    if (tab === 'timeline') loadTimeline();
    if (tab === 'files') loadFiles('.');
    if (tab === 'diff') loadDiff();
  });
});

/* ═══ OVERVIEW ═══ */
async function loadOverview() {
  const data = await api('status');
  const c = data.config, s = data.stats, gs = data.gitStatus;

  // Sidebar info
  $('#sidebar-agent').innerHTML =
    `<strong>${esc(c.agentName)}</strong><span class="agent-fw">${c.framework}</span>`;

  // Stats
  $('#stats-grid').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Snapshots</div>
      <div class="stat-value cyan">${fmtNum(s.totalSnaps)}</div>
      <div class="stat-sub">total taken</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Files Tracked</div>
      <div class="stat-value cyan">${fmtNum(s.trackedFiles)}</div>
      <div class="stat-sub">in workspace</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Days Active</div>
      <div class="stat-value cyan">${s.daysTracked || '< 1'}</div>
      <div class="stat-sub">${s.lastSnap ? 'last ' + timeAgo(s.lastSnap) : 'no snaps yet'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Status</div>
      <div class="stat-value ${gs.clean ? 'green' : 'cyan'}">${gs.clean ? '✓' : gs.total}</div>
      <div class="stat-sub">${gs.clean ? 'all committed' : 'uncommitted change' + (gs.total > 1 ? 's' : '')}</div>
    </div>
  `;

  // Changes
  if (gs.clean) {
    $('#changes-count').textContent = '';
    $('#changes-body').innerHTML = '<div class="empty-state"><span class="es-icon">✓</span><div class="es-text">All changes committed</div><div class="es-sub">Your workspace is clean</div></div>';
  } else {
    $('#changes-count').textContent = gs.total;
    const items = (gs.files || []).slice(0, 15).map(f => {
      let cls = 'ch-mod', icon = '~', label = 'modified';
      if (f.working_dir === '?' || f.index === '?') { cls = 'ch-add'; icon = '+'; label = 'new'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'ch-del'; icon = '−'; label = 'deleted'; }
      return `<div class="change-item" title="${label}"><span class="change-icon ${cls}">${icon}</span><span class="change-path">${esc(f.path)}</span></div>`;
    }).join('');
    const more = gs.total > 15 ? `<div style="padding:8px 0 0;font-size:11px;color:var(--t4)">+ ${gs.total - 15} more files</div>` : '';
    $('#changes-body').innerHTML = items + more;
  }

  // Recent activity
  const entries = await api('log', 'limit=6');
  if (!entries.length) {
    $('#recent-body').innerHTML = '<div class="empty-state"><span class="es-icon">◷</span><div class="es-text">No snapshots yet</div><div class="es-sub">Take your first snapshot</div></div>';
  } else {
    $('#recent-body').innerHTML = '<div style="margin:-14px -18px">' + renderTimeline(entries, true) + '</div>';
  }

  $('#last-updated').textContent = new Date().toLocaleTimeString();
}

/* ═══ TIMELINE ═══ */
let expandedSnap = null;

async function loadTimeline() {
  const entries = await api('log', 'limit=100');
  $('#tl-count').textContent = entries.length;
  if (!entries.length) {
    $('#tl-body').innerHTML = '<div class="empty-state"><span class="es-icon">◷</span><div class="es-text">No snapshots yet</div></div>';
    return;
  }
  $('#tl-body').innerHTML = '<div style="margin:-14px -18px">' + renderTimeline(entries) + '</div>';
}

function renderTimeline(entries, compact) {
  return entries.map((e, i) => {
    const isExpanded = expandedSnap === e.hash;
    return `
    <div class="tl-item" onclick="toggleSnap('${e.hash}')">
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
        <div id="snap-${e.hash.substring(0,8)}" class="${isExpanded ? '' : 'hidden'}"></div>
      </div>
    </div>`;
  }).join('');
}

async function toggleSnap(hash) {
  const short = hash.substring(0, 8);
  const el = $(`#snap-${short}`);
  if (!el) return;

  if (expandedSnap === hash) {
    el.classList.add('hidden');
    expandedSnap = null;
    return;
  }

  expandedSnap = hash;
  $$('[id^="snap-"]').forEach(e => e.classList.add('hidden'));
  el.classList.remove('hidden');
  el.innerHTML = '<div class="tl-detail" style="color:var(--t4)">Loading...</div>';

  // We don't have per-commit file list from the API yet, show a note
  el.innerHTML = `<div class="tl-detail">
    <div style="font-size:11px;color:var(--t3);margin-bottom:4px">Snapshot <code style="color:var(--yellow)">${short}</code></div>
    <div style="font-size:11px;color:var(--t4)">Click the Changes tab to see current diff</div>
  </div>`;
}

/* ═══ FILES ═══ */
let currentPath = '.';

async function loadFiles(p) {
  currentPath = p;
  const files = await api('files', 'path=' + encodeURIComponent(p));

  if (files.error) {
    $('#fb-body').innerHTML = `<div class="empty-state">${esc(files.error)}</div>`;
    return;
  }

  // Breadcrumb
  const parts = [{ name: '~', path: '.' }];
  if (p !== '.') {
    const segs = p.split('/').filter(Boolean);
    let acc = '';
    segs.forEach(s => { acc = acc ? acc + '/' + s : s; parts.push({ name: s, path: acc }); });
  }
  $('#fb-breadcrumb').innerHTML = parts.map((pt, i) =>
    `<span class="bc-seg" onclick="loadFiles('${pt.path.replace(/'/g, "\\'")}')">${esc(pt.name)}</span>` +
    (i < parts.length - 1 ? '<span class="bc-sep">/</span>' : '')
  ).join('');

  // Rows
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
  return { md:'📝', json:'{}', js:'⚡', ts:'⚡', py:'🐍', yml:'⚙️', yaml:'⚙️',
    env:'🔒', sh:'⚡', css:'🎨', html:'🌐', txt:'📄', log:'📋',
    png:'🖼️', jpg:'🖼️', gif:'🖼️', svg:'🖼️', toml:'⚙️' }[ext] || '📄';
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
      <div class="file-content" style="text-align:center;color:var(--t4);padding:40px">Binary file · ${fmtSize(data.size)}</div></div>`;
    return;
  }

  const isMarkdown = p.endsWith('.md');
  const closeBtn = `<button class="fp-close" onclick="$('#file-viewer').innerHTML=''" title="Close">✕</button>`;

  if (isMarkdown) {
    $('#file-viewer').innerHTML = `<div class="file-panel">
      <div class="file-panel-head"><span class="fp-path">${esc(p)}</span><div style="display:flex;gap:8px;align-items:center"><span class="fp-size">${fmtSize(data.size)}</span>${closeBtn}</div></div>
      <div class="md-render">${renderMarkdown(data.content)}</div></div>`;
  } else {
    $('#file-viewer').innerHTML = `<div class="file-panel">
      <div class="file-panel-head"><span class="fp-path">${esc(p)}</span><div style="display:flex;gap:8px;align-items:center"><span class="fp-size">${fmtSize(data.size)}</span>${closeBtn}</div></div>
      <div class="file-content">${esc(data.content)}</div></div>`;
  }

  // Scroll to viewer
  $('#file-viewer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ═══ DIFF ═══ */
async function loadDiff() {
  const data = await api('diff');
  if (!data.diff || !data.diff.trim()) {
    $('#diff-body').innerHTML = '<div class="empty-state"><span class="es-icon">✓</span><div class="es-text">No uncommitted changes</div><div class="es-sub">Everything is up to date</div></div>';
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

/* ═══ ACTIONS ═══ */
async function refresh() {
  await loadOverview();
  toast('Dashboard refreshed', 'info');
}

async function takeSnap() {
  const btn = $('.btn-primary');
  const orig = btn.innerHTML;
  btn.innerHTML = '⏳ Snapping...';
  btn.disabled = true;
  try {
    const result = await api('snap');
    await loadOverview();
    if (result.hash) {
      toast(`✓ Snapshot <strong>${result.hash.substring(0, 8)}</strong> created`, 'success');
    } else {
      toast('No changes to snapshot', 'info');
    }
  } catch (e) {
    toast('Snapshot failed: ' + e.message, 'info');
  }
  btn.innerHTML = orig;
  btn.disabled = false;
}

/* Init */
loadOverview();
setInterval(() => loadOverview(), 30000);
