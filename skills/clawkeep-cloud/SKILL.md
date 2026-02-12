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

## Quick Setup (Keyless Daemon)

One command connects everything — **no password in environment needed**:

```bash
# Opens browser → login → set encryption password in browser
clawkeep cloud setup

# Start auto-sync daemon (NO CLAWKEEP_PASSWORD needed!)
clawkeep watch --sync --daemon
```

The encryption password is set in the browser during setup. The CLI receives only encrypted key material — it never sees your plaintext password.

## Full Setup Flow

### 1. Connect to Cloud (Browser Flow)

```bash
clawkeep cloud setup
# -> Opens browser
# -> Login/Register
# -> Set your encryption password in the browser
# -> Click Connect
# -> CLI receives encrypted key material
```

**Security:** The password is derived into an encryption key in your browser. The plaintext password never leaves the browser, never hits the API, and the CLI never sees it.

### 2. Start Auto-Sync Daemon

```bash
# No password environment variable needed!
clawkeep watch --sync --daemon

# Works with PM2, systemd, or any process manager
pm2 start "clawkeep watch --sync" --name clawkeep-watch
pm2 save
```

### 3. Verify Status

```bash
clawkeep status
clawkeep cloud status
```

## Headless Setup (CI/Agents)

For environments without a browser:

```bash
# Use API key + workspace (password still set via browser first)
clawkeep cloud setup --api-key ck_live_xxxxx --workspace ws_xxxxx
```

## Common Operations

### Sync

```bash
# Manual sync (no password needed if cloud setup done)
clawkeep backup sync

# Check sync status
clawkeep backup status

# Compact backup chunks (reclaim space)
clawkeep backup compact
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
# List backup history
clawkeep log

# Restore from a backup snapshot
clawkeep restore <hash>
```

## Agent Integration

Add to your agent's startup sequence:

```bash
# One-time setup (human does this in browser)
clawkeep cloud setup

# Start auto-backup daemon (no password needed!)
pm2 start "clawkeep watch --sync --interval 10000 -d /path/to/workspace" --name clawkeep-watch
pm2 save
```

## Local/S3 Targets (Non-Cloud)

For local path or S3 targets, set the password once:

```bash
# Set password (stores encrypted key material)
clawkeep backup set-password

# Configure target
clawkeep backup local /mnt/nas/backups
# or
clawkeep backup s3 --endpoint https://... --bucket my-backups

# Start daemon (no password in env needed after set-password)
clawkeep watch --sync --daemon
```

## Troubleshooting

### "No encrypted key material found"

Run the cloud setup again:
```bash
clawkeep cloud setup
```

### "Cannot decrypt chunk" 

Password mismatch. You may need to re-run cloud setup if the password was changed.

### Watch daemon not syncing

Check PM2 logs:
```bash
pm2 logs clawkeep-watch
```

## Security Notes

- **Zero-knowledge:** Server stores only encrypted chunks
- **Keyless daemon:** No password in environment variables
- **Browser-based password:** Plaintext password never leaves your browser
- **Client-side encryption:** All encryption happens locally before upload
- **API keys:** Can be rotated from the dashboard
- **Unrecoverable:** If you lose your password, your data is unrecoverable (true zero-knowledge)
