# ClawKeep Cloud Skill

Encrypted backup storage with zero-knowledge encryption. Your keys, your data.

## When to Use

- Backing up agent workspaces, memory files, configs
- Syncing state across machines
- Point-in-time restore of any file
- Secure off-site backups without trusting the provider

## Prerequisites

1. ClawKeep CLI installed (`npm install -g clawkeep`)
2. ClawKeep Cloud account at https://clawkeep.com

## Quick Setup

One command connects everything:

```bash
# Interactive (opens browser for auth)
clawkeep cloud setup

# Headless (for SSH sessions or CI)
clawkeep cloud setup --api-key ck_live_xxxxx --workspace ws_xxxxx

# Or use environment variable for API key
export CLAWKEEP_API_KEY=ck_live_xxxxx
clawkeep cloud setup --workspace ws_xxxxx
```

Then set your encryption password and sync:

```bash
clawkeep backup set-password
clawkeep backup sync
```

## Full Setup Flow

### 1. Connect to Cloud

```bash
# Browser flow (recommended for first-time setup)
clawkeep cloud setup
# -> Opens browser -> Login/Register -> Click Connect -> Done

# Headless flow (for remote servers, CI, AI agents)
clawkeep cloud setup --api-key ck_live_xxxxx --workspace ws_xxxxx
```

### 2. Set Encryption Password

```bash
# Set password (REMEMBER THIS - unrecoverable if lost)
CLAWKEEP_PASSWORD='your-secure-password' clawkeep backup set-password

# Or pass directly
clawkeep backup set-password -p 'your-secure-password'
```

### 3. Create Files + Sync

```bash
clawkeep snap                    # Snapshot current state
clawkeep backup sync             # Sync encrypted backup to cloud
```

### 4. Auto-Sync with Watch Daemon

```bash
# Start watching for changes (backs up + syncs on every file change)
CLAWKEEP_PASSWORD='xxx' clawkeep watch --daemon
```

## Common Operations

### Sync

```bash
# Manual sync
CLAWKEEP_PASSWORD='xxx' clawkeep backup sync

# Check sync status
clawkeep backup status

# Compact backup chunks (reclaim space)
CLAWKEEP_PASSWORD='xxx' clawkeep backup compact
```

### Cloud Status

```bash
# Show connection info
clawkeep cloud status

# Disconnect from cloud
clawkeep cloud logout
```

### Restore

```bash
# Restore from a backup snapshot
clawkeep restore <hash> -d /path/to/workspace

# View backup history
clawkeep log -d /path/to/workspace
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CLAWKEEP_PASSWORD` | Encryption password | Yes (for sync) |
| `CLAWKEEP_API_KEY` | API key for auth | For headless setup |

## Automated Backup (Daemon)

```bash
# Start watching for changes (backs up on change)
CLAWKEEP_PASSWORD='xxx' clawkeep watch --daemon --interval 10000

# Stop the daemon
clawkeep watch --stop
```

### Using Cron

```bash
# Backup every hour
0 * * * * CLAWKEEP_PASSWORD='xxx' clawkeep backup sync -d /path/to/workspace
```

## Agent Integration

Add to your agent's startup sequence:

```bash
# One-time setup (headless)
clawkeep cloud setup --api-key ck_live_xxx --workspace ws_xxx -p 'password'

# Start auto-backup daemon
CLAWKEEP_PASSWORD='password' clawkeep watch --daemon -d /path/to/workspace
```

## Troubleshooting

### "No API key found"

```bash
clawkeep cloud setup  # Re-authenticate
# or
export CLAWKEEP_API_KEY=ck_live_xxxxx
```

### "Password required for encrypted sync"

```bash
export CLAWKEEP_PASSWORD='your-password'
clawkeep backup sync
```

### "Cannot decrypt chunk"

Password mismatch. Ensure `CLAWKEEP_PASSWORD` matches what was used during backup.

## Security Notes

- All encryption happens client-side before upload
- Server stores only encrypted chunks (ciphertext)
- Password never leaves your machine
- API keys can be rotated from the dashboard
- If you lose your password, your data is unrecoverable (zero-knowledge)
