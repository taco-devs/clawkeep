# Feature Spec: Dashboard Redesign — Backup-First UI

## Context

The current dashboard is a GitHub clone (commits, code browser, diff view). That's wrong — ClawKeep is a **backup product**, not a git client. The dashboard should answer these questions:

1. "Are my files backed up?"
2. "When was the last backup?"
3. "How much data am I protecting?"
4. "How do I get my stuff back?"

Nobody cares about commits. They care about **backups and recovery**.

---

## New Navigation

Replace the current sidebar nav:

```
OLD:                    NEW:
◉ Overview              ◉ Dashboard
⊙ Commits               ↻ History
≡ Code                   ☁ Backup
± Changes                📁 Browse
```

- **Dashboard** — status at a glance (replaces Overview)
- **History** — timeline of changes (replaces Commits, reframed as "backup history")
- **Backup** — backup target config, sync status, export
- **Browse** — file browser + time-travel (replaces Code, keeps existing functionality)

Remove **Changes/Diff** as a top-level tab — fold it into Dashboard as a "pending changes" card if relevant.

---

## Tab 1: Dashboard (home)

The primary view. Everything you need at a glance.

```
┌─────────────────────────────────────────────────────────────────┐
│  🐾 ClawKeep                                        ↻ Refresh  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ STATUS   │  │ BACKUPS  │  │ FILES    │  │ SIZE     │       │
│  │ ✓ Active │  │ 147      │  │ 128      │  │ 2.4 MB   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│                                                                 │
│  ┌─ Protection Status ──────────────────────────────────┐       │
│  │                                                      │       │
│  │  ✓ Watch daemon running                              │       │
│  │  ✓ Last backup: 2 minutes ago                        │       │
│  │  ✓ Backup target: /mnt/nas/backups (synced)          │       │
│  │                                                      │       │
│  │  ── or if something is wrong ──                      │       │
│  │                                                      │       │
│  │  ⚠ Watch daemon not running                          │       │
│  │  ⚠ No backup target configured                      │       │
│  │  ✓ Last backup: 2 minutes ago                        │       │
│  │                                                      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ Recent Changes ─────────────────────────────────────┐       │
│  │  ● 2m ago  — MEMORY.md updated                       │       │
│  │  ○ 15m ago — snapshot — 3 files changed              │       │
│  │  ○ 1h ago  — moltbook-state.json updated             │       │
│  │  ○ 2h ago  — config.json updated                     │       │
│  │  ○ 3h ago  — snapshot — 7 files changed              │       │
│  │                                         [View all →] │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ Pending Changes ────────────────────────────────────┐       │
│  │  2 files changed since last backup                   │       │
│  │  M  memory/2026-02-05.md                             │       │
│  │  M  HEARTBEAT.md                                     │       │
│  │                               [Backup now]           │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Stats cards
- **Status** — "Active" (watch running) / "Idle" (no watch) / "⚠ Error"
- **Backups** — total snapshot count (rename from "commits" — never say commit)
- **Files** — number of tracked files
- **Size** — total repo size (git repo size on disk)

### Protection Status
Green checkmarks for things that are healthy, yellow warnings for problems. Checks:
- Watch daemon running? (check PID file)
- Backup target configured?
- Backup target synced? (last sync recent?)
- Any errors?

### Recent Changes
Last 5 backups from the timeline. Click "View all" → goes to History tab.

### Pending Changes
Files that changed since the last backup. "Backup now" button triggers a snap.

---

## Tab 2: History

The timeline — but framed as "backup history", not "commits".

```
┌─────────────────────────────────────────────────────────────────┐
│  History                                          [Compare]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ● 19:45  MEMORY.md updated                          a8f3c2d1  │
│  │        1 file changed                                        │
│  │                                                              │
│  ○ 19:30  snapshot — 3 files changed                 7b2e9f04  │
│  │        moltbook-state.json, memory/2026-02-05.md, ...        │
│  │                                                              │
│  ○ 19:15  pre-deploy backup                          3c1d8a5e  │
│  │        12 files changed                                      │
│  │                                                              │
│  ○ 18:00  snapshot — 2 files changed                 f9a2b7c3  │
│  │        HEARTBEAT.md, config.json                             │
│  │                                                              │
│  ○ 17:30  initial backup                             d4e5f6a7  │
│           128 files                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Clicking a row expands to show:
- Files changed (with +/- line counts)
- "Browse files at this point" button
- "Restore to this backup" button
- Full diff

Compare mode: click two rows to see diff between them (existing feature, keep it).

**Language change:** Everything says "backup" not "commit/snapshot". Auto-messages should say "backup" too:
- "MEMORY.md updated" (single file)
- "backup — 3 files changed" (multiple files, was "snapshot")
- "initial backup" (was "initial snapshot")

---

## Tab 3: Backup

Where you configure and manage your backup target + export.

```
┌─────────────────────────────────────────────────────────────────┐
│  Backup                                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ Backup Target ──────────────────────────────────────┐       │
│  │                                                      │       │
│  │  📁 Local — /mnt/nas/backups/my-agent                │       │
│  │  Status: ✓ Connected · Last sync: 5m ago             │       │
│  │  Auto-sync: On                                       │       │
│  │                                                      │       │
│  │  [Sync now]  [Test connection]  [Change target]      │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ Export ─────────────────────────────────────────────┐       │
│  │                                                      │       │
│  │  Download an encrypted copy of your entire backup    │       │
│  │  history. AES-256 encrypted, password protected.     │       │
│  │                                                      │       │
│  │  Password: [••••••••••••••]                          │       │
│  │                                                      │       │
│  │  [Download encrypted backup]                         │       │
│  │                                                      │       │
│  │  Estimated size: ~2.4 MB                             │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
│  ┌─ Sync History ───────────────────────────────────────┐       │
│  │  ✓ 19:30 — 3 backups synced to /mnt/nas/...         │       │
│  │  ✓ 19:20 — 1 backup synced                          │       │
│  │  ✓ 19:10 — 5 backups synced                         │       │
│  │  ✗ 19:00 — sync failed: target unreachable          │       │
│  └──────────────────────────────────────────────────────┘       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Export from dashboard

This is NEW — currently export only works via CLI. The dashboard should:

1. Show password input
2. On click: POST to `/api/backup/export` with password
3. Server creates encrypted archive in /tmp
4. Returns download URL
5. Browser downloads the `.clawkeep.enc` file
6. Server cleans up temp file after download

New API endpoint:
```javascript
'backup/export': async (p, req, res) => {
  const password = p.get('password');
  if (!password) return { error: 'password required' };
  const tmpPath = path.join(os.tmpdir(), `clawkeep-export-${Date.now()}.enc`);
  await exportEncrypted(dir, tmpPath, password);
  // Return as download
  res.setHeader('Content-Disposition', 'attachment; filename="backup.clawkeep.enc"');
  res.setHeader('Content-Type', 'application/octet-stream');
  fs.createReadStream(tmpPath).pipe(res);
  // Cleanup after
  setTimeout(() => fs.unlinkSync(tmpPath), 60000);
}
```

---

## Tab 4: Browse

The existing file browser — same functionality, just renamed from "Code" to "Browse". Keeps:
- File tree navigation
- File viewer with syntax highlighting
- Time-travel mode (browse files at any backup point)
- README rendering

---

## Language Changes (Global)

Find and replace across all files:

| Old | New |
|---|---|
| commit | backup |
| snapshot | backup |
| snap (user-facing) | backup |
| "initial snapshot" | "initial backup" |
| "snapshot — N files" | "backup — N files" |
| "Commits" tab | "History" tab |
| "Code" tab | "Browse" tab |
| "Changes" tab | (removed, folded into Dashboard) |

**CLI keeps `snap` as the command name** (it's short and fine), but user-facing messages change:
- `✔ a8f3c2d1 backup — 3 files changed` (was "snapshot")
- `📋 5 backups` (was "5 snapshots")

---

## Files to modify

| File | Changes |
|---|---|
| `ui/index.html` | New nav items (Dashboard, History, Backup, Browse), remove Changes section, add Backup section with export card |
| `ui/app.js` | Rewrite overview → Dashboard with protection status + pending changes. Rewrite commits → History with backup language. New Backup tab with target config + export. Rename code → browse. Remove standalone changes tab. |
| `ui/style.css` | Protection status card styles (green/yellow indicators), export card, backup target cards |
| `src/commands/ui.js` | Add `backup/export` endpoint (file download), add `backup/watch-status` endpoint (check PID), add `backup/repo-size` endpoint |
| `src/core/git.js` | Add `getRepoSize()` method, rename `_autoMessage()` output from "snapshot" to "backup" |
| `src/commands/snap.js` | Change user-facing output: "snapshot" → "backup" |
| `src/commands/log.js` | Change "snapshots" → "backups" in output |
| `src/commands/status.js` | Change "Snapshots" → "Backups", add watch daemon status check, add backup target status |
| `src/commands/watch.js` | Change output messages from "snapshot" to "backup" |

---

## Implementation order

1. Language changes first (snapshot → backup everywhere) — quick win, changes the whole feel
2. Dashboard tab redesign (protection status, pending changes, stats)
3. History tab (reframe commits as backup timeline)
4. Backup tab (target config from SPEC-BACKUP.md + export download)
5. Browse tab (just rename from Code)
6. Remove standalone Changes/Diff tab
7. New API endpoints (watch-status, repo-size, export download)

---

## Testing

1. Open dashboard → Dashboard tab shows protection status, recent changes, pending changes
2. Watch daemon running → green check. Stop it → yellow warning appears
3. History tab → shows backup timeline with "backup" language, not "commit"
4. Backup tab → shows target setup or status. Export button downloads encrypted file.
5. Browse tab → same file browser as before, just renamed
6. CLI: `clawkeep log` says "backups" not "snapshots"
7. CLI: `clawkeep snap` output says "backup" not "snapshot"
