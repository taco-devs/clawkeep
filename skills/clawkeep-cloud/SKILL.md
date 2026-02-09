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
3. API key from dashboard

## Quick Setup

### 1. Authenticate

```bash
# Interactive (opens browser)
clawkeep auth login

# Headless (API key)
clawkeep auth login --api-key ck_live_xxxxx

# Or set environment variable
export CLAWKEEP_API_KEY=ck_live_xxxxx
```

### 2. Create Workspace

```bash
clawkeep workspace create my-agent
# Returns: ws_01HQXXXXXX
```

### 3. Configure Backup Target

```bash
# Set workspace as default target
clawkeep backup cloud --workspace ws_01HQXXXXXX
```

### 4. Initialize Encryption

```bash
# Set encryption password (REMEMBER THIS - unrecoverable if lost)
export CLAWKEEP_PASSWORD='your-secure-password'

# Or initialize interactively
clawkeep init
```

### 5. Sync

```bash
clawkeep backup sync
```

## Common Operations

### Backup

```bash
# Sync all tracked files
clawkeep backup sync

# Force re-upload all chunks (useful after corruption)
clawkeep backup sync --force

# Backup specific directory
clawkeep backup sync ./important-folder
```

### Restore

```bash
# Restore entire workspace to current directory
clawkeep restore .

# Restore single file
clawkeep restore ./MEMORY.md

# Point-in-time restore
clawkeep restore . --at 2024-01-15T10:00:00Z

# Restore to different location
clawkeep restore ./MEMORY.md --output /tmp/restored-memory.md
```

### List Snapshots

```bash
# All snapshots
clawkeep snapshots list

# Snapshots for specific file
clawkeep snapshots list --file ./MEMORY.md

# With timestamps
clawkeep snapshots list --verbose
```

### Workspace Management

```bash
# List workspaces
clawkeep workspace list

# Get workspace details
clawkeep workspace info ws_01HQXXXXXX

# Delete workspace (DESTRUCTIVE)
clawkeep workspace delete ws_01HQXXXXXX
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CLAWKEEP_PASSWORD` | Encryption password | Yes |
| `CLAWKEEP_API_KEY` | API key for auth | For headless |
| `CLAWKEEP_WORKSPACE` | Default workspace ID | No |

## API Key Management

Generate keys at https://clawkeep.com/dashboard/settings/api-keys

Key prefixes:
- `ck_live_*` — Production keys
- `ck_test_*` — Test/sandbox keys

Keys are shown only once at creation. Store securely.

## Automated Backup (Cron/Daemon)

### Using the Watch Daemon

```bash
# Start watching for changes (backs up on change)
CLAWKEEP_PASSWORD='xxx' clawkeep watch --interval 60000

# Run in background
nohup clawkeep watch --interval 60000 > /var/log/clawkeep.log 2>&1 &
```

### Using Cron

```bash
# Backup every hour
0 * * * * CLAWKEEP_PASSWORD='xxx' CLAWKEEP_API_KEY='ck_live_xxx' /usr/local/bin/clawkeep backup sync -q
```

### Using Systemd

```ini
# /etc/systemd/system/clawkeep.service
[Unit]
Description=ClawKeep Backup Watch
After=network.target

[Service]
Type=simple
Environment=CLAWKEEP_PASSWORD=xxx
Environment=CLAWKEEP_API_KEY=ck_live_xxx
WorkingDirectory=/path/to/workspace
ExecStart=/usr/local/bin/clawkeep watch --interval 60000
Restart=always

[Install]
WantedBy=multi-user.target
```

## Agent Integration Tips

### For Clawdbot/AI Agents

Add to your agent's startup:

```bash
# Restore latest state on startup
CLAWKEEP_PASSWORD='xxx' clawkeep restore .

# Start backup daemon in background
CLAWKEEP_PASSWORD='xxx' clawkeep watch --interval 60000 -q &
```

### Memory File Backup

If your agent uses memory files (MEMORY.md, daily notes, etc.):

```bash
# Ensure memory directory is tracked
clawkeep track ./memory/

# Sync after significant changes
clawkeep backup sync
```

### Multi-Machine Sync

To sync agent state across machines:

1. Use the same workspace ID on all machines
2. Restore before starting work: `clawkeep restore .`
3. Sync after changes: `clawkeep backup sync`
4. Handle conflicts manually (last-write-wins by default)

## Troubleshooting

### "Encryption password required"

```bash
# Set the password
export CLAWKEEP_PASSWORD='your-password'

# Or reinitialize
clawkeep init
```

### "Workspace not found"

```bash
# List available workspaces
clawkeep workspace list

# Check if authenticated
clawkeep auth status
```

### "Invalid API key"

1. Check key is correct: `echo $CLAWKEEP_API_KEY`
2. Regenerate at https://clawkeep.com/dashboard/settings/api-keys
3. Ensure key hasn't been revoked

### "Chunk upload failed"

```bash
# Retry with verbose output
clawkeep backup sync --verbose

# Force re-upload
clawkeep backup sync --force
```

### "Cannot decrypt chunk"

Password mismatch. Ensure `CLAWKEEP_PASSWORD` matches what was used during backup.

⚠️ **If you lose your password, your data is unrecoverable.** This is by design (zero-knowledge).

## Security Notes

- All encryption happens client-side before upload
- Server stores only encrypted chunks (ciphertext)
- Password never leaves your machine
- API keys can be scoped and rotated
- Use unique passwords per workspace for isolation
