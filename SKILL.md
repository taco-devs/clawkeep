# ClawKeep — Agent Skill

> Git-powered versioned backups for your workspace. Every change tracked, every state recoverable.

## Overview

ClawKeep gives you version-controlled backups of your workspace files. You can go back to any point in time if something goes wrong — a bad memory update, corrupted config, accidental deletion.

## Prerequisites

ClawKeep must be installed globally:
```bash
npm install -g clawkeep
```

Verify: `clawkeep --version`

## Setup (One Time)

Initialize ClawKeep on your workspace:

```bash
cd /path/to/your/workspace
clawkeep init
```

This creates:
- `.clawkeep/config.json` — minimal config
- `.clawkeepignore` — patterns for files to skip (node_modules, .env, logs, etc.)
- `.gitignore` — auto-synced from .clawkeepignore
- An initial snapshot of all tracked files

## Integration Options

Choose ONE of these approaches:

### Option A: Watch Daemon (Recommended)

Start a background daemon that auto-snapshots on every file change:

```bash
clawkeep watch --daemon -d /path/to/workspace --interval 10000
```

- Runs in background, survives terminal close
- Debounces writes (default 10s) to avoid spam commits
- Stop with: `clawkeep watch --stop -d /path/to/workspace`
- Check if running: `cat /path/to/workspace/.clawkeep/watch.pid`

**When to use:** You want continuous, hands-off backup. Set it once and forget.

**Startup:** Add to your agent's boot sequence or system init.

### Option B: Heartbeat Snapshots

Take periodic snapshots from your heartbeat/cron cycle:

```bash
clawkeep snap -d /path/to/workspace -q
```

- `-q` flag for quiet output (no spinner)
- Only commits if files actually changed (no empty snapshots)
- Add to your heartbeat check or cron job

**When to use:** You want more control over when snapshots happen, or your workspace changes infrequently.

**Example heartbeat entry:**
```
## ClawKeep
- Run `clawkeep snap -d /path/to/workspace -q` every heartbeat
```

### Option C: Intentional Snapshots

Take named snapshots at meaningful moments:

```bash
# Before risky operations
clawkeep snap -d /path/to/workspace -m "pre-deploy backup"

# After completing a task
clawkeep snap -d /path/to/workspace -m "completed memory reorganization"
```

**When to use:** Combined with Option A or B for extra checkpoints at important moments.

## Recovery

When something goes wrong, restore to a previous snapshot:

```bash
# See available snapshots
clawkeep log -d /path/to/workspace

# Restore to a specific snapshot (non-destructive — creates new commit)
clawkeep restore <hash> -d /path/to/workspace

# Restore to N snapshots ago
clawkeep restore HEAD~3 -d /path/to/workspace
```

Restores are safe — they check out the old state and commit it as a new snapshot. Your full history (including the "bad" state) is preserved.

## Checking Status

```bash
# Quick status
clawkeep status -d /path/to/workspace

# See what changed since last snapshot
clawkeep diff -d /path/to/workspace

# View timeline
clawkeep log -d /path/to/workspace -n 10
```

## Web Dashboard

Launch a visual dashboard for your human to browse history:

```bash
clawkeep ui --daemon -d /path/to/workspace --port 3333
```

The dashboard provides:
- Visual commit timeline
- File browser with time-travel (view files at any snapshot)
- Side-by-side diff comparison between any two snapshots
- One-click restore
- Named snapshots

Token-based auth is auto-generated. The URL + token is printed on start.

## Ignore Patterns

Edit `.clawkeepignore` in your workspace root to exclude files from tracking. Default patterns are generated on init. Patterns are auto-synced to `.gitignore`.

Example additions:
```
# Large files
*.db
*.sqlite
videos/

# Temp files
*.tmp
.cache/
```

## Backup Targets (Encrypted)

Configure where your encrypted backups are synced to:

```bash
# Set encryption password (once, required)
clawkeep backup set-password -d /path/to/workspace

# Back up to a local path (NAS, external drive, etc.)
clawkeep backup local /mnt/nas/backups -d /path/to/workspace

# Sync (incremental — only new changes after first sync)
clawkeep backup sync -d /path/to/workspace

# Check backup status
clawkeep backup status -d /path/to/workspace

# Test connection
clawkeep backup test -d /path/to/workspace

# Restore from encrypted backup
clawkeep backup restore /mnt/nas/backups/workspace-id/ -d /path/to/workspace
```

All backups are AES-256-GCM encrypted. Target path only contains opaque `.enc` chunk files.
Available targets: `local` (folder/NAS), `s3` (any S3-compatible storage), `cloud` (ClawKeep Cloud).

### ClawKeep Cloud Target

```bash
# One-command setup (opens browser for auth)
clawkeep cloud setup -d /path/to/workspace

# Headless setup (for SSH, CI, AI agents)
clawkeep cloud setup --api-key ck_live_xxx --workspace ws_xxx -d /path/to/workspace

# Check cloud connection
clawkeep cloud status -d /path/to/workspace

# Disconnect
clawkeep cloud logout
```

### S3 / R2 Target

```bash
# Configure S3-compatible target (Cloudflare R2, AWS S3, MinIO, etc.)
clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key YOUR_ACCESS_KEY \
  --secret-key YOUR_SECRET_KEY \
  --region auto \
  --prefix clawkeep/ \
  -d /path/to/workspace

# Or use environment variables for credentials
export CLAWKEEP_S3_ACCESS_KEY=your-access-key
export CLAWKEEP_S3_SECRET_KEY=your-secret-key

# Sync to S3
clawkeep backup sync -d /path/to/workspace

# Test connection
clawkeep backup test -d /path/to/workspace
```

Works with: Cloudflare R2, AWS S3, Backblaze B2, MinIO, Wasabi, and any S3-compatible service.

## Encrypted Export

Create a portable encrypted backup:

```bash
CLAWKEEP_PASSWORD="strong-password" clawkeep export -d /path/to/workspace
```

Or download encrypted exports directly from the web dashboard's **Backup** tab.

## Programmatic Use (Node.js)

```javascript
const { ClawGit } = require('clawkeep');

const claw = new ClawGit('/path/to/workspace');

// Take snapshot
await claw.snap('checkpoint before risky operation');

// Check if there are pending changes
const status = await claw.status();
if (!status.clean) {
  await claw.snap();
}

// Restore
await claw.restore('abc123');

// Browse old state
const oldFiles = await claw.listFilesAtCommit('abc123', 'memory/');
const oldContent = await claw.showFileAtCommit('abc123', 'MEMORY.md');
```

## Quick Reference

| Action | Command |
|---|---|
| Initialize | `clawkeep init -d <dir>` |
| Auto-backup daemon | `clawkeep watch --daemon -d <dir>` |
| Stop daemon | `clawkeep watch --stop -d <dir>` |
| Manual backup | `clawkeep snap -d <dir> -m "message"` |
| View history | `clawkeep log -d <dir>` |
| Restore | `clawkeep restore <hash> -d <dir>` |
| See changes | `clawkeep diff -d <dir>` |
| Set backup password | `clawkeep backup set-password -d <dir>` |
| Set local target | `clawkeep backup local <path> -d <dir>` |
| Set S3 target | `clawkeep backup s3 --endpoint <url> --bucket <name> -d <dir>` |
| Sync to target | `clawkeep backup sync -d <dir>` |
| Backup status | `clawkeep backup status -d <dir>` |
| Restore from backup | `clawkeep backup restore <path> -d <dir>` |
| Launch dashboard | `clawkeep ui --daemon -d <dir> --port 3333` |
| Stop dashboard | `clawkeep ui --stop -d <dir>` |
| Export encrypted | `clawkeep export -d <dir> -p "password"` |
