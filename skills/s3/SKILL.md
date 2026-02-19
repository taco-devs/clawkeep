# ClawKeep S3 / R2 Backup Skill

Encrypted backups to any S3-compatible object storage — Cloudflare R2, AWS S3, Backblaze B2, MinIO, Wasabi.

## When to Use

- Backing up agent workspaces, memory files, configs to cloud object storage
- Off-site encrypted backups with S3-compatible providers
- Cloudflare R2 (zero egress fees), AWS S3, Backblaze B2, MinIO, Wasabi
- Point-in-time restore from encrypted S3 backups

## Prerequisites

1. ClawKeep CLI installed (`npm install -g clawkeep`)
2. An S3-compatible bucket with access credentials

## Quick Setup

```bash
# Set your encryption password (once — stores encrypted key material)
clawkeep backup set-password -d /path/to/workspace

# Configure S3-compatible target
clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key YOUR_ACCESS_KEY \
  --secret-key YOUR_SECRET_KEY \
  --region auto \
  --prefix clawkeep/ \
  -d /path/to/workspace

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

### 3. Configure S3 Target

Provide credentials inline:

```bash
clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key YOUR_ACCESS_KEY \
  --secret-key YOUR_SECRET_KEY \
  --region auto \
  --prefix clawkeep/ \
  -d /path/to/workspace
```

Or use environment variables for credentials:

```bash
export CLAWKEEP_S3_ACCESS_KEY=your-access-key
export CLAWKEEP_S3_SECRET_KEY=your-secret-key

clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --region auto \
  --prefix clawkeep/ \
  -d /path/to/workspace
```

The bucket only receives opaque `.enc` chunk files — no file names, no metadata, no structure leaked.

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

## Provider Examples

### Cloudflare R2 (Recommended — zero egress fees)

```bash
clawkeep backup s3 \
  --endpoint https://<ACCOUNT_ID>.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key <R2_ACCESS_KEY> \
  --secret-key <R2_SECRET_KEY> \
  --region auto \
  -d /path/to/workspace
```

### AWS S3

```bash
clawkeep backup s3 \
  --endpoint https://s3.<REGION>.amazonaws.com \
  --bucket my-backups \
  --access-key <AWS_ACCESS_KEY_ID> \
  --secret-key <AWS_SECRET_ACCESS_KEY> \
  --region <REGION> \
  -d /path/to/workspace
```

### Backblaze B2

```bash
clawkeep backup s3 \
  --endpoint https://s3.<REGION>.backblazeb2.com \
  --bucket my-backups \
  --access-key <B2_KEY_ID> \
  --secret-key <B2_APPLICATION_KEY> \
  --region <REGION> \
  -d /path/to/workspace
```

### MinIO (Self-Hosted)

```bash
clawkeep backup s3 \
  --endpoint http://localhost:9000 \
  --bucket my-backups \
  --access-key <MINIO_ACCESS_KEY> \
  --secret-key <MINIO_SECRET_KEY> \
  --region us-east-1 \
  -d /path/to/workspace
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
# Restore from encrypted S3 backup
clawkeep backup restore s3://my-backups/clawkeep/workspace-id/ -d /path/to/workspace
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
# One-time setup (provide S3 credentials)
clawkeep backup set-password -d /path/to/workspace
clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key $CLAWKEEP_S3_ACCESS_KEY \
  --secret-key $CLAWKEEP_S3_SECRET_KEY \
  --region auto \
  -d /path/to/workspace

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

### "Access Denied" or "NoSuchBucket"

Verify your credentials and bucket name:
```bash
clawkeep backup test -d /path/to/workspace
```

### "Endpoint not reachable"

Check the endpoint URL. Common formats:
- Cloudflare R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
- AWS S3: `https://s3.<REGION>.amazonaws.com`
- MinIO: `http://localhost:9000`

### Watch daemon not syncing

Check PM2 logs:
```bash
pm2 logs clawkeep-watch
```

## Security Notes

- **AES-256-GCM encryption** — All data encrypted before upload
- **Zero-knowledge bucket** — Object storage only sees numbered `.enc` chunks
- **No metadata leaked** — File names, sizes, and directory structure are all encrypted
- **Keyless daemon** — No password in environment variables after `set-password`
- **Credentials stored locally** — S3 credentials saved in `.clawkeep/config.json`
- **Unrecoverable** — If you lose your password, your data is unrecoverable
