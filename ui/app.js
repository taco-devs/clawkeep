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

  // JSON: special handling
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
    // Block comment
    if (hasBlockComment && code[i] === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const slice = end === -1 ? code.substring(i) : code.substring(i, end + 2);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    // Line comment
    if (code.substring(i, i + commentLine.length) === commentLine) {
      const nl = code.indexOf('\n', i);
      const slice = nl === -1 ? code.substring(i) : code.substring(i, nl);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    // Python/shell: # comment (only at line start or after space)
    if ((lang === 'py' || lang === 'sh') && code[i] === '#') {
      const nl = code.indexOf('\n', i);
      const slice = nl === -1 ? code.substring(i) : code.substring(i, nl);
      out.push('<span class="hl-cm">' + esc(slice) + '</span>');
      i += slice.length;
      continue;
    }
    // Strings
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
    // Numbers
    if (/[0-9]/.test(code[i]) && (i === 0 || /[^a-zA-Z_$]/.test(code[i - 1]))) {
      let j = i;
      while (j < code.length && /[0-9a-fA-FxXoObBeE._]/.test(code[j])) j++;
      out.push('<span class="hl-num">' + esc(code.substring(i, j)) + '</span>');
      i = j;
      continue;
    }
    // Words (keywords, constants, functions)
    if (/[a-zA-Z_$@]/.test(code[i])) {
      let j = i;
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++;
      const word = code.substring(i, j);
      // Look ahead for function call
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
    // Keys
    h = h.replace(/^(\s*)(&quot;[^&]*?&quot;)(\s*:)/g, '$1<span class="hl-prop">$2</span>$3');
    // String values
    h = h.replace(/:\s*(&quot;[^&]*?&quot;)/g, ': <span class="hl-str">$1</span>');
    // Numbers
    h = h.replace(/:\s*(-?[0-9][0-9.eE]*)/g, ': <span class="hl-num">$1</span>');
    // Booleans & null
    h = h.replace(/:\s*(true|false|null)\b/g, ': <span class="hl-const">$1</span>');
    return h;
  }).join('\n');
}

function highlightYAML(code) {
  return code.split('\n').map(line => {
    let h = esc(line);
    // Comments
    if (/^\s*#/.test(line)) return '<span class="hl-cm">' + h + '</span>';
    // Keys
    h = h.replace(/^(\s*)([\w][\w.-]*)(\s*:)/g, '$1<span class="hl-prop">$2</span>$3');
    // String values
    h = h.replace(/:\s*(&quot;[^&]*?&quot;|&#x27;[^&]*?&#x27;)/g, ': <span class="hl-str">$1</span>');
    // Booleans & null
    h = h.replace(/:\s*(true|false|null|yes|no)\s*$/gi, ': <span class="hl-const">$1</span>');
    // Numbers
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
    // Extract filename
    const header = lines[0] || '';
    const match = header.match(/^diff --git a\/(.+?) b\/(.+)/);
    const filename = match ? match[2] : 'unknown';

    // Count additions and deletions
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
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('#page-title').textContent = { overview: 'Overview', commits: 'Commits', files: 'Code', diff: 'Changes' }[tab];
    ['overview', 'commits', 'files', 'diff'].forEach(id => $('#tab-' + id).classList.toggle('hidden', id !== tab));
    if (tab === 'commits') loadCommits();
    if (tab === 'files') { timeTravelHash = null; loadFiles('.'); }
    if (tab === 'diff') loadDiff();
  });
});

/* ═══ OVERVIEW ═══ */
async function loadOverview() {
  const data = await api('status');
  const c = data.config, s = data.stats, gs = data.gitStatus;

  const lastSnap = s.lastSnap ? timeAgo(s.lastSnap) : 'never';
  $('#sidebar-info').innerHTML = `<strong>${s.totalSnaps} snapshots</strong>${s.trackedFiles} files · ${s.daysTracked || '< 1'}d`;

  $('#stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Snapshots</div><div class="stat-value">${s.totalSnaps.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Files tracked</div><div class="stat-value">${s.trackedFiles.toLocaleString()}</div></div>
    <div class="stat-card"><div class="stat-label">Days active</div><div class="stat-value">${s.daysTracked || '< 1'}</div></div>
    <div class="stat-card"><div class="stat-label">Last snapshot</div><div class="stat-value" style="font-size:16px">${lastSnap}</div></div>
  `;

  // Pending changes — compact banner, not a full section
  const banner = $('#pending-banner');
  if (!gs.clean) {
    const fileList = (gs.files || []).slice(0, 5).map(f => {
      let cls = 'cb-m', label = 'M';
      if (f.working_dir === '?' || f.index === '?') { cls = 'cb-a'; label = 'A'; }
      else if (f.working_dir === 'D' || f.index === 'D') { cls = 'cb-d'; label = 'D'; }
      return `<span class="change-badge ${cls}">${label}</span> <span class="pending-path">${esc(f.path)}</span>`;
    }).join('<span class="pending-sep">·</span>');
    const more = gs.total > 5 ? `<span class="pending-more">+${gs.total - 5} more</span>` : '';
    banner.innerHTML = `<div class="pending-banner">
      <div class="pending-left"><span class="pending-dot"></span><strong>${gs.total} unsaved change${gs.total !== 1 ? 's' : ''}</strong></div>
      <div class="pending-files">${fileList}${more}</div>
      <button class="btn btn-primary btn-sm" onclick="takeSnap()">Snapshot now</button>
    </div>`;
  } else {
    banner.innerHTML = '';
  }

  // Recent commits — the main event
  const entries = await api('log', 'limit=20');
  $('#recent-count').textContent = entries.length;
  if (!entries.length) {
    $('#recent-body').innerHTML = '<div class="empty">No snapshots yet. Make some changes and hit Snapshot.</div>';
  } else {
    $('#recent-body').innerHTML = entries.map((e, i) => commitRow(e, i === 0, true)).join('');
  }

  $('#last-updated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ═══ COMMITS ═══ */
let commitDetailHash = null;

async function loadCommits() {
  commitDetailHash = null;
  if (compareMode) toggleCompareMode();
  const detail = $('#commit-detail-view');
  if (detail) detail.classList.add('hidden');
  const list = $('#commits-list');
  if (list) list.classList.remove('hidden');
  const result = $('#compare-result');
  if (result) result.classList.add('hidden');

  const entries = await api('log', 'limit=100');
  $('#commits-count').textContent = entries.length;
  if (!entries.length) { $('#commits-body').innerHTML = '<div class="empty">No commits yet</div>'; return; }
  $('#commits-body').innerHTML = entries.map((e, i) => commitRow(e, i === 0, true)).join('');
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

async function showCommitDetail(hash) {
  commitDetailHash = hash;

  // If we're in the overview tab, switch to commits tab
  const activeTab = $('.nav-item.active');
  if (activeTab && activeTab.dataset.tab !== 'commits') {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    $$('.nav-item').forEach(b => { if (b.dataset.tab === 'commits') b.classList.add('active'); });
    $('#page-title').textContent = 'Commits';
    ['overview', 'commits', 'files', 'diff'].forEach(id => $('#tab-' + id).classList.toggle('hidden', id !== 'commits'));
  }

  // Hide list, show detail
  const list = $('#commits-list');
  if (list) list.classList.add('hidden');
  let detail = $('#commit-detail-view');
  if (!detail) {
    const d = document.createElement('div');
    d.id = 'commit-detail-view';
    $('#tab-commits').appendChild(d);
    detail = d;
  }
  detail.classList.remove('hidden');
  detail.innerHTML = '<div class="empty" style="padding:60px">Loading commit...</div>';

  // Fetch metadata and diff in parallel
  const [meta, diffData] = await Promise.all([
    api('commit', 'hash=' + hash),
    api('commit/diff', 'hash=' + hash),
  ]);

  const short = hash.substring(0, 7);
  const totalAdditions = meta.files ? meta.files.reduce((s, f) => s + (f.changes || 0), 0) : 0;

  detail.innerHTML = `
    <div class="commit-detail-page">
      <button class="btn btn-ghost commit-back" onclick="loadCommits()">&#8592; Back to commits</button>
      <div class="cdp-header">
        <h2 class="cdp-message">${esc(meta.message || 'Commit ' + short)}</h2>
        <div class="cdp-meta">
          <span class="commit-hash">${short}</span>
          <span>${esc(meta.author || 'ClawKeep')} committed ${meta.date ? timeAgo(meta.date) : ''}</span>
        </div>
        <div class="cdp-summary">
          ${meta.files ? meta.files.length + ' file' + (meta.files.length !== 1 ? 's' : '') + ' changed' : ''}
          ${meta.summary ? ' &middot; ' + esc(meta.summary) : ''}
        </div>
        <div class="cdp-actions">
          <button class="btn btn-ghost" onclick="browseAtCommit('${hash}')">📁 Browse files</button>
          <button class="btn btn-danger" onclick="confirmRestore('${hash}')">↩ Restore to this snapshot</button>
        </div>
      </div>
      <div class="cdp-diff">
        ${renderDiffSections(diffData.diff || '')}
      </div>
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
      <span class="file-icon">📁</span><span class="file-name is-dir">..</span>
      <span class="file-msg"></span><span class="file-time"></span></div>`);
  }
  files.forEach(f => {
    const safePath = f.path.replace(/'/g, "\\'");
    if (f.type === 'dir') {
      rows.push(`<div class="file-row" data-filepath="${esc(f.path)}" onclick="loadFiles('${safePath}')">
        <span class="file-icon">📁</span><span class="file-name is-dir">${esc(f.name)}</span>
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

  // Feature 1: Progressively load file history
  loadFileHistory(p);

  // Feature 2: Auto-render README below file list
  const readme = files.find(f => /^readme\.md$/i.test(f.name) && f.type === 'file');
  const readmeContainer = $('#readme-render');
  if (readme) {
    if (readmeContainer) readmeContainer.innerHTML = '<div class="empty" style="padding:24px">Loading README...</div>';
    const data = await api('file', 'path=' + encodeURIComponent(readme.path));
    if (readmeContainer && data.content) {
      readmeContainer.innerHTML = `<div class="box readme-box">
        <div class="box-header"><span class="file-icon">📝</span> ${esc(readme.name)}</div>
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
      // Try matching with the path as-is, or with directory prefix
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

/* ═══ BROWSE AT COMMIT (TIME TRAVEL) ═══ */
let timeTravelHash = null;

function browseAtCommit(hash) {
  timeTravelHash = hash;
  // Switch to Code tab
  $$('.nav-item').forEach(b => b.classList.remove('active'));
  $$('.nav-item').forEach(b => { if (b.dataset.tab === 'files') b.classList.add('active'); });
  $('#page-title').textContent = 'Code';
  ['overview', 'commits', 'files', 'diff'].forEach(id => $('#tab-' + id).classList.toggle('hidden', id !== 'files'));
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

  // Time travel indicator bar
  const ttBar = `<div class="time-travel-bar">
    📌 Browsing at snapshot <span class="tt-hash">${short}</span>
    <button class="btn btn-ghost" onclick="exitTimeTravel()">✕ Exit</button>
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
      <span class="file-icon">📁</span><span class="file-name is-dir">..</span>
      <span class="file-msg"></span><span class="file-time"></span></div>`);
  }
  files.forEach(f => {
    const safePath = f.path.replace(/'/g, "\\'");
    if (f.type === 'dir') {
      rows.push(`<div class="file-row" onclick="loadFilesAtCommit('${hash}','${safePath}')">
        <span class="file-icon">📁</span><span class="file-name is-dir">${esc(f.name)}</span>
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
  return { md:'📝', json:'📋', js:'📜', ts:'📜', py:'🐍', yml:'⚙️', yaml:'⚙️', env:'🔒', sh:'⚙️', css:'🎨', html:'🌐' }[e] || '📄';
}

async function viewFile(p) {
  const data = await api('file', 'path=' + encodeURIComponent(p));
  if (data.error) { $('#file-viewer').innerHTML = `<div class="box"><div class="box-body-pad empty">${esc(data.error)}</div></div>`; return; }
  if (data.binary) { $('#file-viewer').innerHTML = `<div class="box"><div class="fv-header"><span class="fv-path">${esc(p)}</span></div><div class="box-body-pad empty">Binary file · ${fmtSize(data.size)}</div></div>`; return; }

  const close = `<button class="fv-close" onclick="$('#file-viewer').innerHTML=''" title="Close">&#10005;</button>`;
  const isMd = p.endsWith('.md');
  const lang = getLang(p);
  const lines = (data.content || '').split('\n');
  const lineCount = lines.length;

  let body;
  if (isMd) {
    body = `<div class="md-render">${renderMarkdown(data.content)}</div>`;
  } else {
    // Line numbers + syntax highlighting
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


/* ═══ DIFF ═══ */
async function loadDiff() {
  const data = await api('diff');
  if (!data.diff || !data.diff.trim()) {
    $('#diff-body').innerHTML = '<div class="empty">No uncommitted changes</div>';
    return;
  }
  $('#diff-body').innerHTML = renderDiffSections(data.diff);
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
    <h3>Restore to snapshot</h3>
    <p>This will revert all files to snapshot <span class="modal-hash">${short}</span> and create a new snapshot. Your current state will still be in history.</p>
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
    await loadOverview();
    toast('Restored to ' + short + '. New snapshot created.', true);
    // Go back to commits list to see the new restore commit
    loadCommits();
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
    bar.innerHTML = 'Select the <strong>base</strong> commit...';
    result.classList.add('hidden');
    $('#commits-body').classList.add('compare-mode');
  } else {
    toggle.textContent = 'Compare';
    toggle.classList.remove('btn-danger');
    toggle.classList.add('btn-ghost');
    bar.classList.add('hidden');
    result.classList.add('hidden');
    $('#commits-body').classList.remove('compare-mode');
    $$('#commits-body .commit-row.selected').forEach(r => r.classList.remove('selected'));
  }
}

function onCompareClick(hash, el) {
  if (!compareMode) { showCommitDetail(hash); return; }

  if (!compareFrom) {
    compareFrom = hash;
    el.classList.add('selected');
    $('#compare-bar').innerHTML = `Base: <span class="commit-hash">${hash.substring(0, 7)}</span> — now select the <strong>target</strong> commit`;
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
  bar.innerHTML = `Comparing <span class="commit-hash">${fromShort}</span> → <span class="commit-hash">${toShort}</span> <button class="btn btn-ghost btn-sm" onclick="toggleCompareMode()" style="margin-left:auto">Clear</button>`;

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
async function refresh() { await loadOverview(); toast('Refreshed', true); }

function takeSnap() {
  showModal(`
    <h3>Create snapshot</h3>
    <p>Give this snapshot a name, or leave empty for auto-generated.</p>
    <input class="modal-input" id="snap-msg" type="text" placeholder="e.g. before risky deploy" autofocus>
    <div class="modal-actions">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="doSnap()">Snapshot</button>
    </div>
  `);
  // Focus the input after modal renders
  setTimeout(() => { const el = $('#snap-msg'); if (el) el.focus(); }, 50);
}

async function doSnap() {
  const msgEl = $('#snap-msg');
  const msg = msgEl ? msgEl.value.trim() : '';
  closeModal();
  const btn = document.querySelector('.topbar .btn-primary');
  if (btn) { btn.innerHTML = '&#8987; Snapping...'; btn.disabled = true; }
  try {
    const q = msg ? 'message=' + encodeURIComponent(msg) : '';
    const r = await api('snap', q);
    await loadOverview();
    toast(r.hash ? `Snapshot ${r.hash.substring(0, 7)} created` : 'Nothing to commit', true);
  } catch (e) { toast('Error: ' + e.message); }
  if (btn) { btn.innerHTML = '&#10010; Snapshot'; btn.disabled = false; }
}

/* Init */
loadOverview();
setInterval(loadOverview, 30000);
