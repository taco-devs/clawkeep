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

## Taking Snapshots

### Watch Daemon (Recommended)

Start a background daemon that auto-snapshots on every file change:

```bash
clawkeep watch --daemon -d /path/to/workspace --interval 10000
```

- Runs in background, survives terminal close
- Debounces writes (default 10s) to avoid spam commits
- Stop with: `clawkeep watch --stop -d /path/to/workspace`

### Manual Snapshots

```bash
# Quick snapshot (only commits if files changed)
clawkeep snap -d /path/to/workspace -q

# Named snapshot
clawkeep snap -d /path/to/workspace -m "before risky changes"
```

## Recovery

```bash
# See available snapshots
clawkeep log -d /path/to/workspace

# Restore to a specific snapshot (non-destructive — creates new commit)
clawkeep restore <hash> -d /path/to/workspace

# Restore to N snapshots ago
clawkeep restore HEAD~3 -d /path/to/workspace
```

Restores are safe — they check out the old state and commit it as a new snapshot. Your full history is preserved.

## Checking Status

```bash
# Quick status
clawkeep status -d /path/to/workspace

# See what changed since last snapshot
clawkeep diff -d /path/to/workspace

# View timeline
clawkeep log -d /path/to/workspace -n 10
```

## Ignore Patterns

Edit `.clawkeepignore` in your workspace root to exclude files from tracking. Patterns are auto-synced to `.gitignore`.

## Web Dashboard

```bash
clawkeep ui --daemon -d /path/to/workspace --port 3333
```

Visual timeline, file browser with time-travel, side-by-side diffs, one-click restore. Token-based auth is auto-generated.

## Encrypted Backup Targets

For off-site encrypted backups, choose a target and follow its dedicated skill:

| Target | Skill | Description |
|---|---|---|
| **Local path** | [skills/local/SKILL.md](local/SKILL.md) | NAS, USB drive, external disk, network share |
| **S3 / R2** | [skills/s3/SKILL.md](s3/SKILL.md) | Cloudflare R2, AWS S3, Backblaze B2, MinIO, Wasabi |
| **ClawKeep Cloud** | [skills/clawkeep-cloud/SKILL.md](clawkeep-cloud/SKILL.md) | Managed zero-knowledge backup with browser-based setup |

All targets use AES-256-GCM encryption. Your backup destination only sees opaque `.enc` chunk files — no file names, no metadata, no structure.

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
| Launch dashboard | `clawkeep ui --daemon -d <dir> --port 3333` |
| Stop dashboard | `clawkeep ui --stop -d <dir>` |
| Export encrypted | `clawkeep export -d <dir> -p "password"` |
