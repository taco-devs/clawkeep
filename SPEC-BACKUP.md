# Feature Spec: Backup Targets

## Context

ClawKeep is a **backup tool with version control**, not a git client. Users should never need to think about git. The current `push`/`pull` commands expose git semantics — we need to replace this with a "Backup" concept that feels like a backup product.

The backup target is **where your versioned snapshots get synced to**. Three options: local path, ClawKeep Cloud (future SaaS), or custom S3/R2.

---

## 1. New Config: `backup` section in `.clawkeep/config.json`

Replace `remote` with a `backup` object:

```json
{
  "version": "0.1.0",
  "createdAt": "2026-02-05T19:00:00Z",
  "watchInterval": 10000,
  "ignore": [],
  "backup": {
    "target": "local",
    "local": {
      "path": "/mnt/nas/backups/my-agent"
    },
    "cloud": {
      "token": null,
      "endpoint": "https://api.clawkeep.com"
    },
    "s3": {
      "bucket": null,
      "prefix": null,
      "region": null
    },
    "autoSync": true,
    "lastSync": null
  }
}
```

`target` is one of: `"local"` | `"cloud"` | `"s3"` | `"git"` (legacy) | `null` (disabled)

---

## 2. Core: `src/core/backup.js` (new file)

Handles syncing the `.git` directory (the version history) to the backup target.

### Methods

```javascript
class BackupManager {
  constructor(clawGit) {}

  /** Get current backup config */
  getConfig() → { target, status, lastSync, targetLabel }

  /** Set backup target */
  async setTarget(type, options) → config
  //   type: 'local' | 'cloud' | 's3' | 'git' | null
  //   options: { path } | { token } | { bucket, prefix, region } | { url }

  /** Sync to backup target (push) */
  async sync() → { ok, target, snapshotsSynced, lastSync }

  /** Restore from backup target (pull) */
  async pull() → { ok, snapshotsPulled }

  /** Test connection to backup target */
  async test() → { ok, message, latencyMs }
}
```

### Backup strategies by target type

**Local path:**
- Uses `git clone --mirror` to maintain a bare mirror repo at the local path
- On sync: `git push --mirror` to the local bare repo
- On pull: `git fetch` from the local bare repo
- Simple, fast, works with NAS/external drives
- Implementation: `claw.git.raw(['push', '--mirror', localPath])` (after init as bare)

**Cloud (future — stub for now):**
- POST encrypted bundle to `https://api.clawkeep.com/v1/backup`
- Auth via token stored in config
- For now: show "Coming soon" in UI, collect email for waitlist
- Backend is just S3 + thin API layer

**S3/R2:**
- Uses `clawkeep export` (encrypted tar.gz) → upload to S3
- On sync: export + `aws s3 cp` (or use AWS SDK)
- Requires: `@aws-sdk/client-s3` as optional dep
- Prefix path: `s3://bucket/prefix/agent-name/`
- Keeps last N exports (configurable, default 10)

**Git (legacy compat):**
- Existing push/pull behavior, just wrapped
- For power users who want raw git remote

---

## 3. CLI: New `backup` command

```
clawkeep backup                    Show backup status
clawkeep backup set-target         Interactive target setup
clawkeep backup set-target local   Set local path backup
clawkeep backup set-target cloud   Set ClawKeep Cloud
clawkeep backup set-target s3      Set S3/R2 bucket
clawkeep backup sync               Sync now (push to target)
clawkeep backup pull               Pull from target
clawkeep backup test               Test connection
```

### Files

- `bin/clawkeep.js` — add `backup` command with subcommands
- `src/commands/backup.js` — new command file
- `src/core/backup.js` — new core backup manager

### Keep existing `push`/`pull` working

Don't remove them. Have them delegate to `BackupManager.sync()` / `BackupManager.pull()` internally, falling back to the legacy git remote behavior if `backup.target === 'git'` or config has old `remote` field.

---

## 4. API: New backup endpoints

Add to `src/commands/ui.js` apiHandlers:

```javascript
'backup/status': async () => {
  const bm = new BackupManager(claw);
  return bm.getConfig();
},

'backup/set-target': async (p) => {
  const bm = new BackupManager(claw);
  const type = p.get('type');
  const options = JSON.parse(p.get('options') || '{}');
  return await bm.setTarget(type, options);
},

'backup/sync': async () => {
  const bm = new BackupManager(claw);
  return await bm.sync();
},

'backup/test': async () => {
  const bm = new BackupManager(claw);
  return await bm.test();
},
```

---

## 5. Dashboard: New "Backup" tab

### Add to sidebar nav in `ui/index.html`

```html
<button class="nav-item" data-tab="backup"><span class="nav-icon">☁</span> Backup</button>
```

### Add section in content area

```html
<section id="tab-backup" class="hidden">
  <div id="backup-content"></div>
</section>
```

### UI States in `ui/app.js`

**State 1: No backup configured**
```
┌─────────────────────────────────────────────┐
│  ☁ Set Up Backup                            │
│                                             │
│  Keep your snapshots safe by syncing them   │
│  to a backup target.                        │
│                                             │
│  ┌──────────────────────────────────┐       │
│  │ 📁 Local Path                    │       │
│  │ Backup to another directory,     │       │
│  │ NAS, or external drive.          │       │
│  │                      [Set up →]  │       │
│  └──────────────────────────────────┘       │
│                                             │
│  ┌──────────────────────────────────┐       │
│  │ 🐾 ClawKeep Cloud               │       │
│  │ Managed backup storage.          │       │
│  │ Free for 1 project.             │       │
│  │                  [Coming soon]   │       │
│  └──────────────────────────────────┘       │
│                                             │
│  ┌──────────────────────────────────┐       │
│  │ 🪣 S3 / R2 / Custom             │       │
│  │ Bring your own cloud storage.    │       │
│  │                      [Set up →]  │       │
│  └──────────────────────────────────┘       │
│                                             │
│  ┌──────────────────────────────────┐       │
│  │ 🔗 Git Remote (Advanced)        │       │
│  │ Push to any git remote.          │       │
│  │                      [Set up →]  │       │
│  └──────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

**State 2: Backup configured**
```
┌─────────────────────────────────────────────┐
│  Backup                                     │
│                                             │
│  ┌─ Status ─────────────────────────┐       │
│  │ Target:  📁 /mnt/nas/backups     │       │
│  │ Status:  ✓ Connected             │       │
│  │ Last sync: 5 minutes ago         │       │
│  │ Auto-sync: On                    │       │
│  │                                  │       │
│  │ [Sync now]  [Test]  [Change]     │       │
│  └──────────────────────────────────┘       │
│                                             │
│  ┌─ Sync History ───────────────────┐       │
│  │ ✓ 19:30 — 3 snapshots synced    │       │
│  │ ✓ 19:20 — 1 snapshot synced     │       │
│  │ ✓ 19:10 — 5 snapshots synced    │       │
│  └──────────────────────────────────┘       │
│                                             │
│  □ Auto-sync after each snapshot            │
└─────────────────────────────────────────────┘
```

**Local path setup modal:**
```
┌─ Set Up Local Backup ───────────────────────┐
│                                             │
│  Path: [/mnt/nas/backups/my-agent    ]      │
│                                             │
│  This directory will contain a full copy    │
│  of your version history. Any path your     │
│  system can write to works — local drive,   │
│  NAS mount, USB drive.                      │
│                                             │
│              [Cancel]  [Save & Test]        │
└─────────────────────────────────────────────┘
```

---

## 6. Watch mode: Auto-sync integration

In `src/commands/watch.js`, after each successful snap in `doSnap()`:

```javascript
if (result && config.backup?.autoSync && config.backup?.target) {
  try {
    const bm = new BackupManager(claw);
    await bm.sync();
  } catch (e) {
    // Log but don't fail the snap
  }
}
```

---

## 7. Files to modify

| File | Changes |
|---|---|
| `src/core/backup.js` | **NEW** — BackupManager class |
| `src/core/git.js` | Add `mirror()` method for local backup |
| `src/commands/backup.js` | **NEW** — CLI backup command |
| `src/commands/ui.js` | Add backup/* API endpoints |
| `src/commands/watch.js` | Add auto-sync after snap |
| `src/commands/push.js` | Delegate to BackupManager |
| `src/commands/pull.js` | Delegate to BackupManager |
| `bin/clawkeep.js` | Add backup command + subcommands |
| `ui/index.html` | Add Backup nav item + section |
| `ui/app.js` | Backup tab: setup cards, status view, sync history, modals |
| `ui/style.css` | Card styles for backup target selection |

## 8. Implementation order

1. `src/core/backup.js` — BackupManager with local path support first
2. `src/commands/backup.js` — CLI commands
3. `bin/clawkeep.js` — wire up backup command
4. `src/commands/ui.js` — API endpoints
5. `ui/` — Backup tab (setup + status views)
6. Watch mode auto-sync integration
7. S3 support (optional dep, can be v2)
8. Cloud stub (coming soon card, email collection)

## 9. Testing

1. `clawkeep init` on test dir → `clawkeep backup set-target local /tmp/backup-test` → `clawkeep backup sync` → verify bare mirror exists at `/tmp/backup-test`
2. Write files → watch auto-snaps → verify auto-sync pushes to local target
3. Dashboard: Backup tab → shows "not configured" → click Local → enter path → Save & Test → shows status card
4. Dashboard: Click "Sync now" → toast "3 snapshots synced" → last sync updates
5. `clawkeep backup test` → "✓ Connected (12ms)"
