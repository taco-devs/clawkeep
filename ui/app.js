/* ClawKeep — GitHub-style UI */
'use strict';

const TOKEN = new URLSearchParams(location.search).get('token') || '';
const Q = (x) => '?token=' + TOKEN + (x ? '&' + x : '');
const api = async (p, q) => (await fetch('/api/' + p + Q(q))).json();
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => !s ? '' : s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function timeAgo(d) {
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.floor(ms / 60e3), h = Math.floor(ms / 36e5), dy = Math.floor(ms / 864e5);
  if (m < 1) return 'now';
  if (m < 60) return m + (m === 1 ? ' minute' : ' minutes') + ' ago';
  if (h < 24) return h + (h === 1 ? ' hour' : ' hours') + ' ago';
  if (dy < 30) return dy + (dy === 1 ? ' day' : ' days') + ' ago';
  return new Date(d).toLocaleDateString();
}

function fmtSize(b) {
  if (!b && b !== 0) return '';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

function toast(msg, ok) {
  const el = document.createElement('div');
  el.className = 'toast' + (ok ? ' toast-ok' : '');
  el.innerHTML = msg;
  $('#toast-wrap').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 200); }, 3000);
}

function renderMarkdown(text) {
  let h = esc(text);
  h = h.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  h = h.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  h = h.replace(/^# (.+)$/gm, '<h1>$1</h1>');
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/\*(.+?)\*/g, '<em>$1</em>');
  h = h.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  h = h.replace(/^- (.+)$/gm, '<li>$1</li>');
  h = h.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  h = h.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
  h = h.replace(/^---$/gm, '<hr>');
  h = h.replace(/^\|(.+)\|$/gm, (m, c) => {
    const cells = c.split('|').map(x => x.trim());
    if (cells.every(x => /^[-:]+$/.test(x))) return '';
    return '<tr>' + cells.map(x => '<td>' + x + '</td>').join('') + '</tr>';
  });
  h = h.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
  return h;
}

/* Tabs */
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#page-title').textContent = { overview: 'Overview', commits: 'Commits', files: 'Code', diff: 'Changes' }[tab];
    ['overview', 'commits', 'files', 'diff'].forEach(id => $('#tab-' + id).classList.toggle('hidden', id !== tab));
    if (tab === 'commits') loadCommits();
    if (tab === 'files') loadFiles('.');
    if (tab === 'diff') loadDiff();
  });
});

/* ═══ OVERVIEW ═══ */
async function loadOverview() {
  const data = await api('status');
  const c = data.config, s = data.stats, gs = data.gitStatus;

  $('#sidebar-agent').innerHTML = `<strong>${esc(c.agentName)}</strong><span class="agent-fw">${c.framework}</span>`;

  $('#stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Snapshots</div><div class="stat-value">${s.totalSnaps.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Files tracked</div><div class="stat-value">${s.trackedFiles.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Days active</div><div class="stat-value">${s.daysTracked || '< 1'}</div></div>
    <div class="stat-card"><div class="stat-label">Status</div><div class="stat-value" style="color:${gs.clean ? 'var(--green)' : 'var(--yellow)'}">${gs.clean ? 'Clean' : gs.total + ' changed'}</div></div>
  `;

  // Changes
  if (gs.clean) {
    $('#ch-count').textContent = '';
    $('#changes-body').innerHTML = '<div class="empty">✓ Working tree clean</div>';
  } else {
    $('#ch-count').textContent = gs.total;
    $('#changes-body').innerHTML = (gs.files || []).slice(0, 15).map(f => {
      let cls = 'cb-m', label = 'M';
      if (f.working_dir === '?' || f.index === '?') { cls = 'cb-a'; label = 'A'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'cb-d'; label = 'D'; }
      return `<div class="change-row"><span class="change-badge ${cls}">${label}</span><span class="change-path">${esc(f.path)}</span></div>`;
    }).join('');
  }

  // Recent commits
  const entries = await api('log', 'limit=5');
  $('#recent-body').innerHTML = entries.length
    ? entries.map((e, i) => commitRow(e, i === 0)).join('')
    : '<div class="empty">No commits yet</div>';

  $('#last-updated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ═══ COMMITS ═══ */
let expandedHash = null;

async function loadCommits() {
  const entries = await api('log', 'limit=100');
  $('#commits-count').textContent = entries.length;
  if (!entries.length) { $('#commits-body').innerHTML = '<div class="empty">No commits yet</div>'; return; }
  $('#commits-body').innerHTML = entries.map((e, i) => commitRow(e, i === 0, true)).join('');
}

function commitRow(e, isLatest, expandable) {
  const short = e.hash.substring(0, 7);
  const onclick = expandable ? ` onclick="toggleCommit('${e.hash}')"` : '';
  return `
    <div class="commit-row"${onclick}>
      <div class="commit-dot ${isLatest ? 'latest' : 'old'}"></div>
      <div class="commit-body">
        <div class="commit-msg">${esc(e.message)}</div>
        <div class="commit-meta">
          <span>${e.author || 'agent'} committed ${timeAgo(e.date)}</span>
        </div>
      </div>
      <span class="commit-hash">${short}</span>
    </div>
    <div id="cd-${short}" class="hidden"></div>`;
}

async function toggleCommit(hash) {
  const short = hash.substring(0, 7);
  const el = $(`#cd-${short}`);
  if (!el) return;

  if (expandedHash === hash) {
    el.classList.add('hidden');
    expandedHash = null;
    return;
  }

  $$('[id^="cd-"]').forEach(e => e.classList.add('hidden'));
  expandedHash = hash;
  el.classList.remove('hidden');
  el.innerHTML = '<div class="commit-detail" style="color:var(--t3)">Loading...</div>';

  const data = await api('commit', 'hash=' + hash);
  if (!data || !data.files || !data.files.length) {
    el.innerHTML = '<div class="commit-detail"><div style="color:var(--t4)">No file details available</div></div>';
    return;
  }

  el.innerHTML = `<div class="commit-detail">
    <div style="margin-bottom:8px;font-size:12px;color:var(--t3)">${data.files.length} file(s) changed</div>
    <ul class="commit-detail-files">${data.files.map(f => {
      return `<li class="cd-file"><span class="cd-badge cd-modified">M</span><span style="font-family:var(--mono);font-size:12px;color:var(--t2)">${esc(f.path)}</span><span style="font-size:11px;color:var(--t4);margin-left:auto">${f.changes} changes</span></li>`;
    }).join('')}</ul>
    ${data.summary ? `<div style="margin-top:8px;font-size:11px;color:var(--t4)">${esc(data.summary)}</div>` : ''}
  </div>`;
}

/* ═══ FILES ═══ */
let currentPath = '.';

async function loadFiles(p) {
  currentPath = p;
  const files = await api('files', 'path=' + encodeURIComponent(p));
  if (files.error) { $('#fb-body').innerHTML = `<div class="empty">${esc(files.error)}</div>`; return; }

  // Breadcrumb
  const parts = [{ name: 'root', path: '.' }];
  if (p !== '.') {
    const segs = p.split('/').filter(Boolean);
    let acc = '';
    segs.forEach((s, i) => { acc = acc ? acc + '/' + s : s; parts.push({ name: s, path: acc }); });
  }
  const last = parts.length - 1;
  $('#fb-breadcrumb').innerHTML = parts.map((pt, i) =>
    i === last && i > 0
      ? `<span class="bc-current">${esc(pt.name)}</span>`
      : `<span class="bc-seg" onclick="loadFiles('${pt.path.replace(/'/g, "\\'")}')">${esc(pt.name)}</span><span class="bc-sep">/</span>`
  ).join('');

  // Rows
  const rows = [];
  if (p !== '.') {
    const parent = p.split('/').slice(0, -1).join('/') || '.';
    rows.push(`<div class="file-row" onclick="loadFiles('${parent.replace(/'/g, "\\'")}')">
      <span class="file-icon">📁</span><span class="file-name is-dir">..</span></div>`);
  }
  files.forEach(f => {
    if (f.type === 'dir') {
      rows.push(`<div class="file-row" onclick="loadFiles('${f.path.replace(/'/g, "\\'")}')">
        <span class="file-icon">📁</span><span class="file-name is-dir">${esc(f.name)}</span>
        <span class="file-msg"></span><span class="file-time"></span></div>`);
    } else {
      rows.push(`<div class="file-row" onclick="viewFile('${f.path.replace(/'/g, "\\'")}')">
        <span class="file-icon">${fIcon(f.name)}</span>
        <span class="file-name">${esc(f.name)}</span>
        <span class="file-msg"></span>
        <span class="file-time">${fmtSize(f.size)}</span></div>`);
    }
  });
  $('#fb-body').innerHTML = rows.join('');
  $('#file-viewer').innerHTML = '';
}

function fIcon(n) {
  const e = n.split('.').pop().toLowerCase();
  return { md:'📝', json:'📋', js:'📜', ts:'📜', py:'🐍', yml:'⚙️', yaml:'⚙️', env:'🔒', sh:'⚙️', css:'🎨', html:'🌐' }[e] || '📄';
}

async function viewFile(p) {
  const data = await api('file', 'path=' + encodeURIComponent(p));
  if (data.error) { $('#file-viewer').innerHTML = `<div class="box"><div class="box-body-pad empty">${esc(data.error)}</div></div>`; return; }
  if (data.binary) { $('#file-viewer').innerHTML = `<div class="box"><div class="fv-header"><span class="fv-path">${esc(p)}</span></div><div class="box-body-pad empty">Binary file · ${fmtSize(data.size)}</div></div>`; return; }

  const close = `<button class="fv-close" onclick="$('#file-viewer').innerHTML=''" title="Close">✕</button>`;
  const isMd = p.endsWith('.md');

  $('#file-viewer').innerHTML = `<div class="box">
    <div class="fv-header"><span class="fv-path">${esc(p)}</span><div class="fv-meta"><span>${fmtSize(data.size)}</span>${close}</div></div>
    ${isMd
      ? `<div class="md-render">${renderMarkdown(data.content)}</div>`
      : `<div class="fv-code">${esc(data.content)}</div>`
    }</div>`;
  $('#file-viewer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ═══ DIFF ═══ */
async function loadDiff() {
  const data = await api('diff');
  if (!data.diff || !data.diff.trim()) {
    $('#diff-body').innerHTML = '<div class="empty">✓ No uncommitted changes</div>';
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
  $('#diff-body').innerHTML = '<div class="diff-view">' + lines + '</div>';
}

/* ═══ ACTIONS ═══ */
async function refresh() { await loadOverview(); toast('Refreshed', true); }

async function takeSnap() {
  const btn = $('.btn-primary');
  btn.innerHTML = '⏳ Snapping...'; btn.disabled = true;
  try {
    const r = await api('snap');
    await loadOverview();
    toast(r.hash ? `Snapshot ${r.hash.substring(0, 7)} created` : 'Nothing to commit', true);
  } catch (e) { toast('Error: ' + e.message); }
  btn.innerHTML = '✚ Snapshot'; btn.disabled = false;
}

/* Init */
loadOverview();
setInterval(loadOverview, 30000);
