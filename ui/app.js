/* ClawKeep — Backup Dashboard */
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

/* ═══ SYNTAX HIGHLIGHTING ═══ */
const LANG_MAP = {
  js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
  ts: 'js', tsx: 'js',
  py: 'py', python: 'py',
  json: 'json',
  css: 'css',
  html: 'html', htm: 'html', xml: 'html', svg: 'html',
  yml: 'yaml', yaml: 'yaml',
  sh: 'sh', bash: 'sh', zsh: 'sh',
  go: 'go',
  rs: 'rust', rust: 'rust',
  java: 'java',
  md: 'md',
};

const KW = {
  js: 'abstract|async|await|break|case|catch|class|const|continue|debugger|default|delete|do|else|enum|export|extends|finally|for|from|function|if|implements|import|in|instanceof|interface|let|new|of|package|private|protected|public|return|static|super|switch|this|throw|try|typeof|var|void|while|with|yield',
  py: 'and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield',
  go: 'break|case|chan|const|continue|default|defer|else|fallthrough|for|func|go|goto|if|import|interface|map|package|range|return|select|struct|switch|type|var',
  rust: 'as|async|await|break|const|continue|crate|dyn|else|enum|extern|fn|for|if|impl|in|let|loop|match|mod|move|mut|pub|ref|return|self|static|struct|super|trait|type|unsafe|use|where|while',
  java: 'abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|return|short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|void|volatile|while',
  css: '@media|@keyframes|@import|@font-face|@supports|@charset',
};

const CONSTS = {
  js: 'true|false|null|undefined|NaN|Infinity|arguments|console|window|document|module|exports|require|process|globalThis|Promise|Array|Object|String|Number|Boolean|Symbol|Map|Set|WeakMap|WeakSet|Error|RegExp|Math|JSON|Date|parseInt|parseFloat',
  py: 'True|False|None|self|cls|print|len|range|str|int|float|list|dict|set|tuple|type|super|property|staticmethod|classmethod|isinstance|issubclass|hasattr|getattr|setattr|enumerate|zip|map|filter|sorted|reversed|open|input|Exception',
  go: 'true|false|nil|iota|append|cap|close|complex|copy|delete|imag|len|make|new|panic|print|println|real|recover|error|string|bool|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|byte|rune',
  rust: 'true|false|self|Self|Some|None|Ok|Err|Box|Vec|String|Option|Result|impl|println|eprintln|format|todo|unimplemented|unreachable|assert|panic|cfg|derive|allow|deny|warn|test|macro_rules',
  java: 'true|false|null|this|super|System|String|Integer|Boolean|Double|Float|Long|Short|Byte|Character|Object|Class|Exception|RuntimeException|Thread|Runnable|Override|Deprecated|SuppressWarnings',
};

function getLang(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  return LANG_MAP[ext] || null;
}

function highlight(code, lang) {
  if (!lang || lang === 'md') return esc(code);

  if (lang === 'json') return highlightJSON(code);
  if (lang === 'yaml') return highlightYAML(code);
  if (lang === 'html') return highlightHTML(code);
  if (lang === 'css') return highlightCSS(code);

  const kw = KW[lang] || KW.js;
  const cn = CONSTS[lang] || CONSTS.js;
  const commentLine = (lang === 'py' || lang === 'sh') ? '#' : '//';
  const hasBlockComment = (lang !== 'py' && lang !== 'sh');

  const out = [];
  let i = 0;
  while (i < code.length) {
    if (hasBlockComment && code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const slice = end === -1 ? code.substring(i) : code.substring(i, end + 2);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    if (code.substring(i, i + commentLine.length) === commentLine) {
      const nl = code.indexOf('\n', i);
      const slice = nl === -1 ? code.substring(i) : code.substring(i, nl);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    if ((lang === 'py' || lang === 'sh') && code[i] === '#') {
      const nl = code.indexOf('\n', i);
      const slice = nl === -1 ? code.substring(i) : code.substring(i, nl);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const q = code[i];
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) { j++; break; }
        if (q !== '`' && code[j] === '\n') break;
        j++;
      }
      out.push('<span class="hl-str">' + esc(code.substring(i, j)) + '</span>');
      i = j;
      continue;
    }
    if (/[0-9]/.test(code[i]) && (i === 0 || /[^a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[0-9a-fA-FxXoObBeE._]/.test(code[j])) j++;
      out.push('<span class="hl-num">' + esc(code.substring(i, j)) + '</span>');
      i = j;
      continue;
    }
    if (/[a-zA-Z_$@]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.substring(i, j);
      let la = j;
      while (la < code.length && code[la] === ' ') la++;
      if (new RegExp('^(' + kw + ')$').test(word)) {
        out.push('<span class="hl-kw">' + esc(word) + '</span>');
      } else if (new RegExp('^(' + cn + ')$').test(word)) {
        out.push('<span class="hl-const">' + esc(word) + '</span>');
      } else if (code[la] === '(') {
        out.push('<span class="hl-fn">' + esc(word) + '</span>');
      } else {
        out.push(esc(word));
      }
      i = j;
      continue;
    }
    out.push(esc(code[i]));
    i++;
  }
  return out.join('');
}

function highlightJSON(code) {
  return code.split('\n').map(line => {
    let h = esc(line);
    h = h.replace(/^(\s*)(&quot;[^&]*?&quot;)(\s*:)/g, '$1<span class="hl-prop">$2</span>$3');
    h = h.replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="hl-str">$1</span>');
    h = h.replace(/:\s*(-?[0-9][0-9.eE]*)/g, ': <span class="hl-num">$1</span>');
    h = h.replace(/:\s*(true|false|null)\b/g, ': <span class="hl-const">$1</span>');
    return h;
  }).join('\n');
}

function highlightYAML(code) {
  return code.split('\n').map(line => {
    let h = esc(line);
    if (/^\s*#/.test(line)) return '<span class="hl-cm">' + h + '</span>';
    h = h.replace(/^(\s*)([\w][\w.-]*)(\s*:)/g, '$1<span class="hl-prop">$2</span>$3');
    h = h.replace(/:\s*(&quot;[^&]*?&quot;|&#x27;[^&]*?&#x27;)/g, ': <span class="hl-str">$1</span>');
    h = h.replace(/:\s*(true|false|null|yes|no)\s*$/gi, ': <span class="hl-const">$1</span>');
    h = h.replace(/:\s*(-?[0-9][0-9.]*)\s*$/g, ': <span class="hl-num">$1</span>');
    return h;
  }).join('\n');
}

function highlightHTML(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === '<' && code[i + 1] === '!') {
      const end = code.indexOf('-->', i);
      const slice = end === -1 ? code.substring(i) : code.substring(i, end + 3);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
    } else if (code[i] === '<') {
      const end = code.indexOf('>', i);
      const tag = end === -1 ? code.substring(i) : code.substring(i, end + 1);
      let h = esc(tag);
      h = h.replace(/^(&lt;\/?)([\w-]+)/, '$1<span class="hl-kw">$2</span>');
      h = h.replace(/([\w-]+)(=)/g, '<span class="hl-prop">$1</span>$2');
      h = h.replace(/(&quot;[^&]*?&quot;)/g, '<span class="hl-str">$1</span>');
      out.push(h);
      i += tag.length;
    } else {
      const next = code.indexOf('<', i);
      const slice = next === -1 ? code.substring(i) : code.substring(i, next);
      out.push(esc(slice));
      i += slice.length;
    }
  }
  return out.join('');
}

function highlightCSS(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const slice = end === -1 ? code.substring(i) : code.substring(i, end + 2);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
    } else if (code[i] === '"' || code[i] === "'") {
      const q = code[i]; let j = i + 1;
      while (j < code.length && code[j] !== q && code[j] !== '\n') { if (code[j] === '\\') j++; j++; }
      if (j < code.length && code[j] === q) j++;
      out.push('<span class="hl-str">' + esc(code.substring(i, j)) + '</span>');
      i = j;
    } else if (code[i] === '{' || code[i] === '}' || code[i] === ';') {
      out.push(esc(code[i]));
      i++;
    } else if (code[i] === ':' && i > 0) {
      out.push(':');
      i++;
    } else if (code[i] === '@') {
      let j = i; while (j < code.length && /[a-zA-Z-]/.test(code[j + 1] || '')) j++;
      j++;
      out.push('<span class="hl-kw">' + esc(code.substring(i, j)) + '</span>');
      i = j;
    } else if (/[#.]/.test(code[i]) && (i === 0 || /[\s{};,]/.test(code[i - 1]))) {
      let j = i; while (j < code.length && /[a-zA-Z0-9_-]/.test(code[j + 1] || '')) j++;
      j++;
      out.push('<span class="hl-fn">' + esc(code.substring(i, j)) + '</span>');
      i = j;
    } else {
      out.push(esc(code[i]));
      i++;
    }
  }
  return out.join('');
}


/* ═══ DIFF PARSER ═══ */
function parseDiffSections(rawDiff) {
  if (!rawDiff || !rawDiff.trim()) return [];

  const chunks = rawDiff.split(/^(?=diff --git )/m);
  return chunks.filter(c => c.trim()).map(chunk => {
    const lines = chunk.split('\n');
    const header = lines[0] || '';
    const match = header.match(/^diff --git a\/(.+?) b\/(.+)/);
    const filename = match ? match[2] : 'unknown';

    let additions = 0, deletions = 0;
    const body = [];
    let oldLine = 0, newLine = 0;

    for (let i = 1; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith('index ') || l.startsWith('--- ') || l.startsWith('+++ ')) continue;
      if (l.startsWith('@@')) {
        const hm = l.match(/@@ -(\d+)/);
        const hm2 = l.match(/\+(\d+)/);
        oldLine = hm ? parseInt(hm[1]) : 0;
        newLine = hm2 ? parseInt(hm2[1]) : 0;
        body.push({ type: 'hunk', text: l });
        continue;
      }
      if (l.startsWith('+')) {
        additions++;
        body.push({ type: 'add', text: l.substring(1), newLine: newLine++ });
      } else if (l.startsWith('-')) {
        deletions++;
        body.push({ type: 'del', text: l.substring(1), oldLine: oldLine++ });
      } else if (l.startsWith('\\')) {
        body.push({ type: 'info', text: l });
      } else {
        body.push({ type: 'ctx', text: l.substring(1) || '', oldLine: oldLine++, newLine: newLine++ });
      }
    }

    return { filename, additions, deletions, body };
  });
}

function renderDiffSections(rawDiff) {
  const sections = parseDiffSections(rawDiff);
  if (!sections.length) return '<div class="empty">No changes</div>';

  return sections.map((s, idx) => {
    const id = 'diff-section-' + idx;
    const bodyHtml = s.body.map(l => {
      const e = esc(l.text);
      if (l.type === 'hunk') return `<tr class="diff-hunk"><td class="diff-ln"></td><td class="diff-ln"></td><td class="diff-ln-code"><span class="d-hunk">${esc(l.text)}</span></td></tr>`;
      if (l.type === 'add') return `<tr class="diff-line-add"><td class="diff-ln"></td><td class="diff-ln">${l.newLine}</td><td class="diff-ln-code"><span class="d-add">+${e}</span></td></tr>`;
      if (l.type === 'del') return `<tr class="diff-ln-del"><td class="diff-ln">${l.oldLine}</td><td class="diff-ln"></td><td class="diff-ln-code"><span class="d-del">-${e}</span></td></tr>`;
      if (l.type === 'info') return `<tr><td class="diff-ln"></td><td class="diff-ln"></td><td class="diff-ln-code" style="color:var(--t4)">${esc(l.text)}</td></tr>`;
      return `<tr><td class="diff-ln">${l.oldLine || ''}</td><td class="diff-ln">${l.newLine || ''}</td><td class="diff-ln-code">${e}</td></tr>`;
    }).join('');

    return `<div class="diff-section">
      <div class="diff-file-header" onclick="toggleDiffSection('${id}')">
        <span class="diff-chevron" id="chev-${id}">&#9660;</span>
        <span class="file-icon">${fIcon(s.filename)}</span>
        <span class="diff-file-name">${esc(s.filename)}</span>
        <span class="diff-stat">
          ${s.additions ? '<span class="diff-stat-add">+' + s.additions + '</span>' : ''}
          ${s.deletions ? '<span class="diff-stat-del">-' + s.deletions + '</span>' : ''}
        </span>
      </div>
      <div class="diff-file-body" id="${id}">
        <table class="diff-table"><tbody>${bodyHtml}</tbody></table>
      </div>
    </div>`;
  }).join('');
}

function toggleDiffSection(id) {
  const el = document.getElementById(id);
  const chev = document.getElementById('chev-' + id);
  if (!el) return;
  el.classList.toggle('collapsed');
  if (chev) chev.innerHTML = el.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
}


/* ═══ TABS ═══ */
function switchTab(name) {
  $$('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === name);
  });
  $('#page-title').textContent = { dashboard: 'Dashboard', history: 'History', backup: 'Backup', browse: 'Browse' }[name];
  ['dashboard', 'history', 'backup', 'browse'].forEach(id => {
    const el = $('#tab-' + id);
    if (el) el.classList.toggle('hidden', id !== name);
  });
  if (name === 'dashboard') loadDashboard();
  if (name === 'history') loadHistory();
  if (name === 'backup') loadBackup();
  if (name === 'browse') { timeTravelHash = null; loadFiles('.'); }
}

$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});


/* ═══ DASHBOARD ═══ */
async function loadDashboard() {
  const [data, backupStatus, watchStatus, repoSize] = await Promise.all([
    api('status'),
    api('backup/status').catch(() => ({})),
    api('backup/watch-status').catch(() => ({})),
    api('backup/repo-size').catch(() => ({})),
  ]);

  const s = data.stats, gs = data.gitStatus;
  const lastBackup = s.lastSnap ? timeAgo(s.lastSnap) : 'never';
  const sizeStr = repoSize.size ? fmtSize(repoSize.size) : '--';
  const isWatching = watchStatus.running || false;
  const statusLabel = isWatching ? 'Active' : 'Idle';

  $('#sidebar-info').innerHTML = `<strong>${s.totalSnaps} backups</strong>${s.trackedFiles} files`;

  // Stats grid
  $('#stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Status</div><div class="stat-value">${statusLabel}</div></div>
    <div class="stat-card"><div class="stat-label">Backups</div><div class="stat-value">${s.totalSnaps.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Files</div><div class="stat-value">${s.trackedFiles.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Size</div><div class="stat-value">${sizeStr}</div></div>
  `;

  // Protection status
  const checks = [];
  if (isWatching) {
    checks.push('<div class="prot-item prot-ok"><span class="prot-icon">&#10003;</span> Watch daemon running</div>');
  } else {
    checks.push('<div class="prot-item prot-warn"><span class="prot-icon">&#9888;</span> Watch daemon not running</div>');
  }
  if (s.lastSnap) {
    checks.push(`<div class="prot-item prot-ok"><span class="prot-icon">&#10003;</span> Last backup: ${lastBackup}</div>`);
  } else {
    checks.push('<div class="prot-item prot-warn"><span class="prot-icon">&#9888;</span> No backups yet</div>');
  }
  if (backupStatus.target) {
    const syncLabel = backupStatus.lastSync ? `synced ${timeAgo(backupStatus.lastSync)}` : 'not synced yet';
    checks.push(`<div class="prot-item prot-ok"><span class="prot-icon">&#10003;</span> Backup target: ${esc(backupStatus.targetLabel || backupStatus.target)} (${syncLabel})</div>`);
    if (backupStatus.target === 'local' && backupStatus.passwordSet) {
      const chunkInfo = backupStatus.chunkCount ? ` (${backupStatus.chunkCount} chunk${backupStatus.chunkCount !== 1 ? 's' : ''})` : '';
      checks.push(`<div class="prot-item prot-ok"><span class="prot-icon">&#10003;</span> Encrypted backup${chunkInfo}</div>`);
    } else if (backupStatus.target === 'local' && !backupStatus.passwordSet) {
      checks.push('<div class="prot-item prot-warn"><span class="prot-icon">&#9888;</span> Encryption password not set</div>');
    }
  } else {
    checks.push('<div class="prot-item prot-warn"><span class="prot-icon">&#9888;</span> No backup target configured</div>');
  }
  $('#protection-status').innerHTML = `<div class="box prot-box"><div class="box-header">Protection status</div><div class="box-body-pad">${checks.join('')}</div></div>`;

  // Pending changes
  const banner = $('#pending-banner');
  if (!gs.clean) {
    const fileList = (gs.files || []).slice(0, 5).map(f => {
      let cls = 'cb-m', label = 'M';
      if (f.working_dir === '?' || f.index === '?') { cls = 'cb-a'; label = 'A'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'cb-d'; label = 'D'; }
      return `<span class="change-badge ${cls}">${label}</span> <span class="pending-path">${esc(f.path)}</span>`;
    }).join('<span class="pending-sep">&middot;</span>');
    const more = gs.total > 5 ? `<span class="pending-more">+${gs.total - 5} more</span>` : '';
    banner.innerHTML = `<div class="pending-banner">
      <div class="pending-left"><span class="pending-dot"></span><strong>${gs.total} unsaved change${gs.total !== 1 ? 's' : ''}</strong></div>
      <div class="pending-files">${fileList}${more}</div>
      <button class="btn btn-primary btn-sm" onclick="takeSnap()">Backup now</button>
    </div>`;
  } else {
    banner.innerHTML = '';
  }

  // Recent changes (last 5)
  const entries = await api('log', 'limit=5');
  $('#recent-count').textContent = entries.length;
  if (!entries.length) {
    $('#recent-body').innerHTML = '<div class="empty">No backups yet. Make some changes and back up.</div>';
  } else {
    const viewAll = `<div class="view-all"><a href="#" onclick="switchTab('history');return false">View all &rarr;</a></div>`;
    $('#recent-body').innerHTML = entries.map((e, i) => commitRow(e, i === 0, false)).join('') + viewAll;
  }

  $('#last-updated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}


/* ═══ HISTORY ═══ */
let historyDetailHash = null;

async function loadHistory() {
  historyDetailHash = null;
  if (compareMode) toggleCompareMode();
  const detail = $('#history-detail-view');
  if (detail) detail.classList.add('hidden');
  const list = $('#history-list');
  if (list) list.classList.remove('hidden');
  const result = $('#compare-result');
  if (result) result.classList.add('hidden');

  const entries = await api('log', 'limit=100');
  $('#history-count').textContent = entries.length;
  if (!entries.length) { $('#history-body').innerHTML = '<div class="empty">No backups yet</div>'; return; }
  $('#history-body').innerHTML = entries.map((e, i) => commitRow(e, i === 0, true)).join('');
}

function commitRow(e, isLatest, clickable) {
  const short = e.hash.substring(0, 7);
  const onclick = clickable ? ` onclick="onCompareClick('${e.hash}', this)"` : '';
  const date = new Date(e.date);
  const fullDate = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="commit-row"${onclick}>
      <div class="commit-timeline"><div class="commit-dot ${isLatest ? 'latest' : 'old'}"></div><div class="commit-line"></div></div>
      <div class="commit-body">
        <div class="commit-msg">${esc(e.message)}</div>
        <div class="commit-meta">
          <span class="commit-hash">${short}</span>
          <span>${timeAgo(e.date)}</span>
          <span class="commit-fulldate">${fullDate}</span>
        </div>
      </div>
    </div>`;
}

async function showBackupDetail(hash) {
  historyDetailHash = hash;

  // Switch to history tab if not already there
  const activeTab = $('.nav-item.active');
  if (activeTab && activeTab.dataset.tab !== 'history') {
    switchTab('history');
  }

  // Hide list, show detail
  const list = $('#history-list');
  if (list) list.classList.add('hidden');
  let detail = $('#history-detail-view');
  if (!detail) {
    const d = document.createElement('div');
    d.id = 'history-detail-view';
    $('#tab-history').appendChild(d);
    detail = d;
  }
  detail.classList.remove('hidden');
  detail.innerHTML = '<div class="empty" style="padding:60px">Loading backup...</div>';

  const [meta, diffData] = await Promise.all([
    api('commit', 'hash=' + hash),
    api('commit/diff', 'hash=' + hash),
  ]);

  const short = hash.substring(0, 7);

  detail.innerHTML = `
    <div class="commit-detail-page">
      <button class="btn btn-ghost commit-back" onclick="loadHistory()">&#8592; Back to history</button>
      <div class="cdp-header">
        <h2 class="cdp-message">${esc(meta.message || 'Backup ' + short)}</h2>
        <div class="cdp-meta">
          <span class="commit-hash">${short}</span>
          <span>${meta.date ? timeAgo(meta.date) : ''}</span>
        </div>
        <div class="cdp-summary">
          ${meta.files ? meta.files.length + ' file' + (meta.files.length !== 1 ? 's' : '') + ' changed' : ''}
          ${meta.summary ? ' &middot; ' + esc(meta.summary) : ''}
        </div>
        <div class="cdp-actions">
          <button class="btn btn-ghost" onclick="browseAtCommit('${hash}')">Browse files at this point</button>
          <button class="btn btn-danger" onclick="confirmRestore('${hash}')">Restore to this backup</button>
        </div>
      </div>
      <div class="cdp-diff">
        ${renderDiffSections(diffData.diff || '')}
      </div>
    </div>`;
}


/* ═══ BACKUP TAB ═══ */
async function loadBackup() {
  const [backupStatus, repoSize, passwordStatus] = await Promise.all([
    api('backup/status').catch(() => ({})),
    api('backup/repo-size').catch(() => ({})),
    api('backup/has-password').catch(() => ({ set: false })),
  ]);

  const container = $('#backup-content');
  let html = '';

  // Password setup card (for local targets or when no target yet)
  if (!backupStatus.target || backupStatus.target === 'local') {
    const pwSet = passwordStatus.set || backupStatus.passwordSet;
    html += `<div class="box">
      <div class="box-header">Encryption</div>
      <div class="box-body-pad">
        ${pwSet
          ? '<div class="prot-item prot-ok"><span class="prot-icon">&#10003;</span> Encryption password set &mdash; backups are encrypted with AES-256-GCM</div>'
          : `<p class="target-prompt">Set an encryption password to protect your backups. Your password is never stored &mdash; only a hash for verification.</p>
            <div class="export-form">
              <input class="modal-input" id="backup-password" type="password" placeholder="Encryption password">
              <button class="btn btn-primary" onclick="doSetBackupPassword()">Set password</button>
            </div>`
        }
      </div>
    </div>`;
  }

  if (backupStatus.target) {
    // Configured: show status card
    const syncLabel = backupStatus.lastSync ? timeAgo(backupStatus.lastSync) : 'never';
    const autoSync = backupStatus.autoSync ? 'On' : 'Off';

    html += `<div class="box" style="margin-top:16px">
      <div class="box-header">Backup target</div>
      <div class="box-body-pad">
        <div class="target-status">
          <div class="target-info">
            <div class="target-type">${esc(backupStatus.target.charAt(0).toUpperCase() + backupStatus.target.slice(1))} &mdash; ${esc(backupStatus.targetLabel || '')}</div>
            <div class="target-detail">Last sync: ${syncLabel} &middot; Auto-sync: ${autoSync}</div>
            ${backupStatus.chunkCount ? `<div class="target-detail">Chunks: ${backupStatus.chunkCount}${backupStatus.workspaceId ? ' &middot; Workspace: ' + esc(backupStatus.workspaceId) : ''}</div>` : ''}
          </div>
          <div class="target-actions">
            <button class="btn btn-primary btn-sm" onclick="doSync()">Sync now</button>
            <button class="btn btn-ghost btn-sm" onclick="doTest()">Test connection</button>
            <button class="btn btn-ghost btn-sm" onclick="showSetTarget()">Change target</button>
            ${backupStatus.chunkCount > 10 ? '<button class="btn btn-ghost btn-sm" onclick="doCompact()">Compact</button>' : ''}
          </div>
        </div>
      </div>
    </div>`;
  } else {
    // Not configured: show target selection
    html += `<div class="box" style="margin-top:16px">
      <div class="box-header">Backup target</div>
      <div class="box-body-pad">
        <p class="target-prompt">Choose where to back up your data.</p>
        <div class="target-cards">
          <div class="target-card" onclick="showSetTarget('local')">
            <div class="target-card-icon">&#128193;</div>
            <div class="target-card-title">Local path</div>
            <div class="target-card-desc">Encrypted backup to a local folder, NAS, or external drive</div>
          </div>
          <div class="target-card" onclick="showSetTarget('git')">
            <div class="target-card-icon">&#128268;</div>
            <div class="target-card-title">Git remote</div>
            <div class="target-card-desc">Push to a remote git repository</div>
          </div>
          <div class="target-card disabled">
            <div class="target-card-icon">&#9729;</div>
            <div class="target-card-title">Cloud</div>
            <div class="target-card-desc">Coming soon</div>
          </div>
          <div class="target-card disabled">
            <div class="target-card-icon">&#9741;</div>
            <div class="target-card-title">S3</div>
            <div class="target-card-desc">Coming soon</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  container.innerHTML = html;
}

function showSetTarget(type) {
  if (type === 'local') {
    showModal(`
      <h3>Set local backup target</h3>
      <p>Enter the path where encrypted backups will be stored. All data is AES-256-GCM encrypted before writing.</p>
      <input class="modal-input" id="target-path" type="text" placeholder="/mnt/nas/backups/my-project" autofocus>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="doSetTarget('local')">Set target</button>
      </div>
    `);
    setTimeout(() => { const el = $('#target-path'); if (el) el.focus(); }, 50);
  } else if (type === 'git') {
    showModal(`
      <h3>Set git remote target</h3>
      <p>Enter the URL of the remote repository.</p>
      <input class="modal-input" id="target-url" type="text" placeholder="git@github.com:user/repo.git" autofocus>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="doSetTarget('git')">Set target</button>
      </div>
    `);
    setTimeout(() => { const el = $('#target-url'); if (el) el.focus(); }, 50);
  } else {
    // Show choice modal (when changing target)
    showModal(`
      <h3>Change backup target</h3>
      <p>Select a backup target type.</p>
      <div class="modal-actions" style="flex-direction:column;gap:8px;align-items:stretch">
        <button class="btn btn-ghost" onclick="closeModal();showSetTarget('local')">Local path</button>
        <button class="btn btn-ghost" onclick="closeModal();showSetTarget('git')">Git remote</button>
      </div>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      </div>
    `);
  }
}

async function doSetTarget(type) {
  let options = {};
  if (type === 'local') {
    const path = $('#target-path').value.trim();
    if (!path) { toast('Path is required'); return; }
    options = { path };
  } else if (type === 'git') {
    const url = $('#target-url').value.trim();
    if (!url) { toast('URL is required'); return; }
    options = { url };
  }
  closeModal();
  toast('Setting backup target...');
  try {
    const r = await api('backup/set-target', 'type=' + encodeURIComponent(type) + '&options=' + encodeURIComponent(JSON.stringify(options)));
    if (r.error) { toast('Error: ' + esc(r.error)); return; }
    toast('Backup target set', true);
    loadBackup();
  } catch (e) { toast('Error: ' + esc(e.message)); }
}

async function doSync() {
  // Check if local target — need password
  const status = await api('backup/status').catch(() => ({}));
  if (status.target === 'local') {
    showModal(`
      <h3>Sync backup</h3>
      <p>Enter your encryption password to sync.</p>
      <input class="modal-input" id="sync-password" type="password" placeholder="Encryption password" autofocus>
      <div class="modal-actions">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="runSync()">Sync</button>
      </div>
    `);
    setTimeout(() => { const el = $('#sync-password'); if (el) el.focus(); }, 50);
    return;
  }
  runSyncDirect();
}

async function runSync() {
  const password = $('#sync-password').value.trim();
  if (!password) { toast('Password required'); return; }
  closeModal();
  toast('Syncing...');
  try {
    const r = await api('backup/sync', 'password=' + encodeURIComponent(password));
    if (r.error) { toast('Sync failed: ' + esc(r.error)); return; }
    if (r.synced === false) { toast(r.message || 'Already up to date', true); return; }
    toast('Synced successfully' + (r.chunkCount ? ' (' + r.chunkCount + ' chunks)' : ''), true);
    loadBackup();
  } catch (e) { toast('Sync failed: ' + esc(e.message)); }
}

async function runSyncDirect() {
  toast('Syncing...');
  try {
    const r = await api('backup/sync');
    if (r.error) { toast('Sync failed: ' + esc(r.error)); return; }
    toast('Synced successfully', true);
    loadBackup();
  } catch (e) { toast('Sync failed: ' + esc(e.message)); }
}

async function doTest() {
  toast('Testing connection...');
  try {
    const r = await api('backup/test');
    if (r.error) { toast('Test failed: ' + esc(r.error)); return; }
    toast('Connection OK (' + (r.latency || 0) + 'ms)', true);
  } catch (e) { toast('Test failed: ' + esc(e.message)); }
}

async function downloadExport() {
  const password = $('#export-password').value;
  if (!password) { toast('Password required'); return; }
  const btn = $('#export-btn');
  btn.disabled = true;
  btn.textContent = 'Preparing...';
  try {
    const res = await fetch('/api/backup/export' + Q('password=' + encodeURIComponent(password)));
    if (!res.ok) {
      let msg = 'Export failed';
      try { const d = await res.json(); msg = d.error || msg; } catch {}
      toast(msg);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'backup.clawkeep.enc';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Export downloaded', true);
  } catch (e) { toast('Export failed: ' + esc(e.message)); }
  finally {
    btn.disabled = false;
    btn.textContent = 'Download encrypted backup';
  }
}

async function doSetBackupPassword() {
  const el = $('#backup-password');
  const password = el ? el.value.trim() : '';
  if (!password) { toast('Password is required'); return; }
  toast('Setting password...');
  try {
    const r = await api('backup/set-password', 'password=' + encodeURIComponent(password));
    if (r.error) { toast('Error: ' + esc(r.error)); return; }
    toast('Encryption password set', true);
    loadBackup();
  } catch (e) { toast('Error: ' + esc(e.message)); }
}

async function doCompact() {
  showModal(`
    <h3>Compact backup</h3>
    <p>This will merge all incremental chunks into a single full backup. Enter your encryption password to continue.</p>
    <input class="modal-input" id="compact-password" type="password" placeholder="Encryption password" autofocus>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="runCompact()">Compact</button>
    </div>
  `);
  setTimeout(() => { const el = $('#compact-password'); if (el) el.focus(); }, 50);
}

async function runCompact() {
  const password = $('#compact-password').value.trim();
  if (!password) { toast('Password required'); return; }
  closeModal();
  toast('Compacting...');
  try {
    const r = await api('backup/compact', 'password=' + encodeURIComponent(password));
    if (r.error) { toast('Compact failed: ' + esc(r.error)); return; }
    if (r.compacted === false) { toast(r.message || 'Nothing to compact'); return; }
    toast('Compacted ' + r.oldChunks + ' chunks into 1', true);
    loadBackup();
  } catch (e) { toast('Compact failed: ' + esc(e.message)); }
}


/* ═══ BROWSE ═══ */
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
    segs.forEach((s) => { acc = acc ? acc + '/' + s : s; parts.push({ name: s, path: acc }); });
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
      <span class="file-icon">&#128193;</span><span class="file-name is-dir">..</span>
      <span class="file-msg"></span><span class="file-time"></span></div>`);
  }
  files.forEach(f => {
    const safePath = f.path.replace(/'/g, "\\'");
    if (f.type === 'dir') {
      rows.push(`<div class="file-row" data-filepath="${esc(f.path)}" onclick="loadFiles('${safePath}')">
        <span class="file-icon">&#128193;</span><span class="file-name is-dir">${esc(f.name)}</span>
        <span class="file-msg"></span><span class="file-time"></span></div>`);
    } else {
      rows.push(`<div class="file-row" data-filepath="${esc(f.path)}" onclick="viewFile('${safePath}')">
        <span class="file-icon">${fIcon(f.name)}</span>
        <span class="file-name">${esc(f.name)}</span>
        <span class="file-msg"></span>
        <span class="file-time">${fmtSize(f.size)}</span></div>`);
    }
  });
  $('#fb-body').innerHTML = rows.join('');
  $('#file-viewer').innerHTML = '';

  loadFileHistory(p);

  const readme = files.find(f => /^readme\.md$/i.test(f.name) && f.type === 'file');
  const readmeContainer = $('#readme-render');
  if (readme) {
    if (readmeContainer) readmeContainer.innerHTML = '<div class="empty" style="padding:24px">Loading README...</div>';
    const data = await api('file', 'path=' + encodeURIComponent(readme.path));
    if (readmeContainer && data.content) {
      readmeContainer.innerHTML = `<div class="box readme-box">
        <div class="box-header"><span class="file-icon">&#128221;</span> ${esc(readme.name)}</div>
        <div class="md-render">${renderMarkdown(data.content)}</div>
      </div>`;
    }
  } else if (readmeContainer) {
    readmeContainer.innerHTML = '';
  }
}

async function loadFileHistory(p) {
  try {
    const history = await api('file-history', 'path=' + encodeURIComponent(p === '.' ? '' : p));
    if (!history || history.error) return;

    $$('#fb-body .file-row[data-filepath]').forEach(row => {
      const fp = row.getAttribute('data-filepath');
      const h = history[fp] || history[p === '.' ? fp : p + '/' + fp.split('/').pop()];
      if (h) {
        const msgEl = row.querySelector('.file-msg');
        const timeEl = row.querySelector('.file-time');
        if (msgEl) msgEl.textContent = h.message || '';
        if (timeEl) timeEl.textContent = timeAgo(h.date);
      }
    });
  } catch {}
}

/* ═══ BROWSE AT BACKUP (TIME TRAVEL) ═══ */
let timeTravelHash = null;

function browseAtCommit(hash) {
  timeTravelHash = hash;
  switchTab('browse');
  loadFilesAtCommit(hash, '');
}

function exitTimeTravel() {
  timeTravelHash = null;
  loadFiles('.');
}

async function loadFilesAtCommit(hash, dir) {
  const short = hash.substring(0, 7);
  const files = await api('files-at', 'hash=' + encodeURIComponent(hash) + '&path=' + encodeURIComponent(dir));
  if (files.error) { $('#fb-body').innerHTML = `<div class="empty">${esc(files.error)}</div>`; return; }

  const ttBar = `<div class="time-travel-bar">
    Browsing at backup <span class="tt-hash">${short}</span>
    <button class="btn btn-ghost" onclick="exitTimeTravel()">&#10005; Exit</button>
  </div>`;

  // Breadcrumb
  const parts = [{ name: 'root', path: '' }];
  if (dir) {
    const segs = dir.split('/').filter(Boolean);
    let acc = '';
    segs.forEach((s) => { acc = acc ? acc + '/' + s : s; parts.push({ name: s, path: acc }); });
  }
  const last = parts.length - 1;
  $('#fb-breadcrumb').innerHTML = parts.map((pt, i) =>
    i === last && i > 0
      ? `<span class="bc-current">${esc(pt.name)}</span>`
      : `<span class="bc-seg" onclick="loadFilesAtCommit('${hash}','${pt.path.replace(/'/g, "\\'")}')">${esc(pt.name)}</span><span class="bc-sep">/</span>`
  ).join('');

  // Rows
  const rows = [];
  if (dir) {
    const parent = dir.split('/').slice(0, -1).join('/');
    rows.push(`<div class="file-row" onclick="loadFilesAtCommit('${hash}','${parent.replace(/'/g, "\\'")}')">
      <span class="file-icon">&#128193;</span><span class="file-name is-dir">..</span>
      <span class="file-msg"></span><span class="file-time"></span></div>`);
  }
  files.forEach(f => {
    const safePath = f.path.replace(/'/g, "\\'");
    if (f.type === 'dir') {
      rows.push(`<div class="file-row" onclick="loadFilesAtCommit('${hash}','${safePath}')">
        <span class="file-icon">&#128193;</span><span class="file-name is-dir">${esc(f.name)}</span>
        <span class="file-msg"></span><span class="file-time"></span></div>`);
    } else {
      rows.push(`<div class="file-row" onclick="viewFileAtCommit('${hash}','${safePath}')">
        <span class="file-icon">${fIcon(f.name)}</span>
        <span class="file-name">${esc(f.name)}</span>
        <span class="file-msg"></span><span class="file-time"></span></div>`);
    }
  });
  $('#fb-body').innerHTML = ttBar + rows.join('');
  $('#file-viewer').innerHTML = '';
  $('#readme-render').innerHTML = '';
}

async function viewFileAtCommit(hash, p) {
  const data = await api('file-at', 'hash=' + encodeURIComponent(hash) + '&path=' + encodeURIComponent(p));
  if (!data || data.error) { $('#file-viewer').innerHTML = `<div class="box"><div class="box-body-pad empty">${esc((data && data.error) || 'Not found')}</div></div>`; return; }
  if (data.binary) { $('#file-viewer').innerHTML = `<div class="box"><div class="fv-header"><span class="fv-path">${esc(p)}</span></div><div class="box-body-pad empty">Binary file</div></div>`; return; }

  const short = hash.substring(0, 7);
  const close = `<button class="fv-close" onclick="$('#file-viewer').innerHTML=''" title="Close">&#10005;</button>`;
  const isMd = p.endsWith('.md');
  const lang = getLang(p);
  const lines = (data.content || '').split('\n');
  const lineCount = lines.length;

  let body;
  if (isMd) {
    body = `<div class="md-render">${renderMarkdown(data.content)}</div>`;
  } else {
    const tableRows = lines.map((line, i) => {
      const num = i + 1;
      const highlighted = highlight(line, lang);
      return `<tr id="L${num}" class="code-row"><td class="ln">${num}</td><td class="code-line">${highlighted || ' '}</td></tr>`;
    }).join('');
    body = `<div class="code-scroll"><table class="code-table"><tbody>${tableRows}</tbody></table></div>`;
  }

  $('#file-viewer').innerHTML = `<div class="box">
    <div class="fv-header">
      <span class="fv-path">${esc(p)} <span style="color:var(--t4)">@ ${short}</span></span>
      <div class="fv-meta">
        <span>${lineCount} lines</span>
        ${close}
      </div>
    </div>
    ${body}
  </div>`;
  $('#file-viewer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}


function fIcon(n) {
  const e = n.split('.').pop().toLowerCase();
  return { md:'&#128221;', json:'&#128203;', js:'&#128220;', ts:'&#128220;', py:'&#128013;', yml:'&#9881;', yaml:'&#9881;', env:'&#128274;', sh:'&#9881;', css:'&#127912;', html:'&#127760;' }[e] || '&#128196;';
}

async function viewFile(p) {
  const data = await api('file', 'path=' + encodeURIComponent(p));
  if (data.error) { $('#file-viewer').innerHTML = `<div class="box"><div class="box-body-pad empty">${esc(data.error)}</div></div>`; return; }
  if (data.binary) { $('#file-viewer').innerHTML = `<div class="box"><div class="fv-header"><span class="fv-path">${esc(p)}</span></div><div class="box-body-pad empty">Binary file &middot; ${fmtSize(data.size)}</div></div>`; return; }

  const close = `<button class="fv-close" onclick="$('#file-viewer').innerHTML=''" title="Close">&#10005;</button>`;
  const isMd = p.endsWith('.md');
  const lang = getLang(p);
  const lines = (data.content || '').split('\n');
  const lineCount = lines.length;

  let body;
  if (isMd) {
    body = `<div class="md-render">${renderMarkdown(data.content)}</div>`;
  } else {
    const tableRows = lines.map((line, i) => {
      const num = i + 1;
      const highlighted = highlight(line, lang);
      return `<tr id="L${num}" class="code-row"><td class="ln" onclick="highlightLine(${num})">${num}</td><td class="code-line">${highlighted || ' '}</td></tr>`;
    }).join('');
    body = `<div class="code-scroll"><table class="code-table"><tbody>${tableRows}</tbody></table></div>`;
  }

  $('#file-viewer').innerHTML = `<div class="box">
    <div class="fv-header">
      <span class="fv-path">${esc(p)}</span>
      <div class="fv-meta">
        <span>${lineCount} lines</span>
        <span>${fmtSize(data.size)}</span>
        ${close}
      </div>
    </div>
    ${body}
  </div>`;
  $('#file-viewer').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function highlightLine(num) {
  $$('.code-row.highlighted').forEach(r => r.classList.remove('highlighted'));
  const row = document.getElementById('L' + num);
  if (row) row.classList.add('highlighted');
}


/* ═══ MODAL ═══ */
function showModal(html) {
  $('#modal').innerHTML = html;
  $('#modal-overlay').classList.remove('hidden');
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  $('#modal').classList.add('hidden');
}

/* ═══ RESTORE ═══ */
function confirmRestore(hash) {
  const short = hash.substring(0, 7);
  showModal(`
    <h3>Restore to backup</h3>
    <p>This will revert all files to backup <span class="modal-hash">${short}</span> and create a new backup. Your current state will still be in history.</p>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="doRestore('${hash}')">Restore</button>
    </div>
  `);
}

async function doRestore(hash) {
  closeModal();
  const short = hash.substring(0, 7);
  toast('Restoring to ' + short + '...');
  try {
    const r = await api('restore', 'hash=' + hash);
    if (r.error) { toast('Error: ' + r.error); return; }
    await loadDashboard();
    toast('Restored to ' + short + '. New backup created.', true);
    loadHistory();
  } catch (e) { toast('Restore failed: ' + e.message); }
}

/* ═══ COMPARE ═══ */
let compareMode = false;
let compareFrom = null;
let compareTo = null;

function toggleCompareMode() {
  compareMode = !compareMode;
  compareFrom = null;
  compareTo = null;
  const toggle = $('#compare-toggle');
  const bar = $('#compare-bar');
  const result = $('#compare-result');

  if (compareMode) {
    toggle.textContent = 'Cancel';
    toggle.classList.add('btn-danger');
    toggle.classList.remove('btn-ghost');
    bar.classList.remove('hidden');
    bar.innerHTML = 'Select the <strong>base</strong> backup...';
    result.classList.add('hidden');
    $('#history-body').classList.add('compare-mode');
  } else {
    toggle.textContent = 'Compare';
    toggle.classList.remove('btn-danger');
    toggle.classList.add('btn-ghost');
    bar.classList.add('hidden');
    result.classList.add('hidden');
    $('#history-body').classList.remove('compare-mode');
    $$('#history-body .commit-row.selected').forEach(r => r.classList.remove('selected'));
  }
}

function onCompareClick(hash, el) {
  if (!compareMode) { showBackupDetail(hash); return; }

  if (!compareFrom) {
    compareFrom = hash;
    el.classList.add('selected');
    $('#compare-bar').innerHTML = `Base: <span class="commit-hash">${hash.substring(0, 7)}</span> &mdash; now select the <strong>target</strong> backup`;
  } else if (!compareTo && hash !== compareFrom) {
    compareTo = hash;
    el.classList.add('selected');
    runCompare();
  }
}

async function runCompare() {
  const bar = $('#compare-bar');
  const fromShort = compareFrom.substring(0, 7);
  const toShort = compareTo.substring(0, 7);
  bar.innerHTML = `Comparing <span class="commit-hash">${fromShort}</span> &rarr; <span class="commit-hash">${toShort}</span> <button class="btn btn-ghost btn-sm" onclick="toggleCompareMode()" style="margin-left:auto">Clear</button>`;

  const result = $('#compare-result');
  result.classList.remove('hidden');
  result.innerHTML = '<div class="empty" style="padding:40px">Loading diff...</div>';

  try {
    const data = await api('compare', 'from=' + compareFrom + '&to=' + compareTo);
    if (data.error) { result.innerHTML = `<div class="empty">${esc(data.error)}</div>`; return; }
    result.innerHTML = `<div class="box"><div class="box-header">Changes between ${fromShort} and ${toShort}</div><div class="box-body">${renderDiffSections(data.diff || '')}</div></div>`;
  } catch (e) {
    result.innerHTML = `<div class="empty">Compare failed: ${esc(e.message)}</div>`;
  }
}

/* ═══ ACTIONS ═══ */
async function refresh() { await loadDashboard(); toast('Refreshed', true); }

function takeSnap() {
  showModal(`
    <h3>Create backup</h3>
    <p>Give this backup a name, or leave empty for auto-generated.</p>
    <input class="modal-input" id="snap-msg" type="text" placeholder="e.g. before risky deploy" autofocus>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="doSnap()">Backup</button>
    </div>
  `);
  setTimeout(() => { const el = $('#snap-msg'); if (el) el.focus(); }, 50);
}

async function doSnap() {
  const msgEl = $('#snap-msg');
  const msg = msgEl ? msgEl.value.trim() : '';
  closeModal();
  const btn = document.querySelector('.topbar .btn-primary');
  if (btn) { btn.innerHTML = '&#8987; Backing up...'; btn.disabled = true; }
  try {
    const q = msg ? 'message=' + encodeURIComponent(msg) : '';
    const r = await api('snap', q);
    await loadDashboard();
    toast(r.hash ? `Backup ${r.hash.substring(0, 7)} created` : 'Nothing to back up', true);
  } catch (e) { toast('Error: ' + e.message); }
  if (btn) { btn.innerHTML = '&#10010; Backup now'; btn.disabled = false; }
}

/* Init */
loadDashboard();
setInterval(loadDashboard, 30000);
