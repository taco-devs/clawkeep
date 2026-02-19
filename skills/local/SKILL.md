# ClawKeep Local Backup Skill

Encrypted backups to any local path — NAS, USB drive, external disk, network share.

## When to Use

- Backing up agent workspaces, memory files, configs to a local/mounted path
- Air-gapped or offline encrypted backups
- NAS, USB drive, or network share backup targets
- Point-in-time restore from local encrypted backups

## Prerequisites

1. ClawKeep CLI installed (`npm install -g clawkeep`)
2. A mounted local path (NAS, USB, external drive, network share)

## Quick Setup

```bash
# Set your encryption password (once — stores encrypted key material)
clawkeep backup set-password -d /path/to/workspace

# Configure local backup target
clawkeep backup local /mnt/nas/backups -d /path/to/workspace

# Start auto-sync daemon (no password in env needed after set-password!)
clawkeep watch --sync --daemon -d /path/to/workspace
```

After `set-password`, the daemon runs without any password in the environment.

## Full Setup Flow

### 1. Initialize ClawKeep

```bash
cd /path/to/workspace
clawkeep init
```

### 2. Set Encryption Password

```bash
clawkeep backup set-password -d /path/to/workspace
```

This stores encrypted key material locally. You won't need the password in your environment again.

### 3. Configure Local Target

```bash
clawkeep backup local /mnt/nas/backups -d /path/to/workspace
```

The target path only receives opaque `.enc` chunk files — no file names, no metadata, no structure leaked.

### 4. Test Connection

```bash
clawkeep backup test -d /path/to/workspace
```

### 5. Start Auto-Sync Daemon

```bash
# No CLAWKEEP_PASSWORD needed!
clawkeep watch --sync --daemon -d /path/to/workspace

# Works with PM2, systemd, or any process manager
pm2 start "clawkeep watch --sync -d /path/to/workspace" --name clawkeep-watch
pm2 save
```

## Common Operations

### Sync

```bash
# Manual sync
clawkeep backup sync -d /path/to/workspace

# Check backup status
clawkeep backup status -d /path/to/workspace
```

### Restore from Backup

```bash
# Restore from encrypted local backup
clawkeep backup restore /mnt/nas/backups/workspace-id/ -d /path/to/workspace
```

### Snapshots

```bash
# Manual named snapshot
clawkeep snap -d /path/to/workspace -m "before risky changes"

# View history
clawkeep log -d /path/to/workspace

# Restore to a specific snapshot
clawkeep restore <hash> -d /path/to/workspace

# Restore to N snapshots ago
clawkeep restore HEAD~3 -d /path/to/workspace
```

## Agent Integration

Add to your agent's startup sequence:

```bash
# One-time setup
clawkeep backup set-password -d /path/to/workspace
clawkeep backup local /mnt/nas/backups -d /path/to/workspace

# Start auto-backup daemon (no password needed!)
pm2 start "clawkeep watch --sync --interval 10000 -d /path/to/workspace" --name clawkeep-watch
pm2 save
```

## Troubleshooting

### "No encrypted key material found"

Run set-password again:
```bash
clawkeep backup set-password -d /path/to/workspace
```

### "Target path not accessible"

Verify the mount is available:
```bash
ls /mnt/nas/backups
```

### Watch daemon not syncing

Check PM2 logs:
```bash
pm2 logs clawkeep-watch
```

## Security Notes

- **AES-256-GCM encryption** — All data encrypted before leaving your machine
- **Zero-knowledge target** — Backup path only sees numbered `.enc` chunks
- **No metadata leaked** — File names, sizes, and directory structure are all encrypted
- **Keyless daemon** — No password in environment variables after `set-password`
- **Unrecoverable** — If you lose your password, your data is unrecoverable
