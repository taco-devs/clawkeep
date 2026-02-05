# SPEC: Encrypted Incremental Sync

## Summary

Replace bare git mirror backup with encrypted incremental chunk-based sync. Backups are opaque encrypted files — no git repos exposed, no file contents visible. Works for local paths, cloud, and S3.

## Problem

Current local backup creates a bare git repo on the target. This:
- Exposes full file history in plaintext
- Requires git on the target machine
- Feels like "managing git" which violates ClawKeep's "you never touch git" promise
- Full re-upload on every sync (no incremental for non-git targets)

## Design

### Backup Format

```
<target-path>/
  <workspace-id>/
    manifest.enc        ← encrypted JSON index of all chunks
    chunk-0001.enc      ← initial full bundle (one-time, large)
    chunk-0002.enc      ← incremental (commits since chunk-0001)
    chunk-0003.enc      ← incremental (commits since chunk-0002)
    ...
```

- **workspace-id**: derived from directory name + random suffix on init, stored in `.clawkeep/config.json` as `backup.workspaceId`
- Each `.enc` file is independently encrypted — you can verify any single file without downloading all of them
- Chunk numbering is sequential, zero-padded to 6 digits

### Encryption

- **Algorithm:** AES-256-GCM (authenticated encryption — integrity + confidentiality)
- **Key derivation:** scrypt(password, salt) → 32-byte key
- **File format per .enc file:**

```
[4 bytes]   magic: "CK01"
[32 bytes]  salt (random per file)
[12 bytes]  IV/nonce (random per file)
[N bytes]   ciphertext (AES-256-GCM encrypted payload)
[16 bytes]  auth tag (GCM tag, appended by crypto)
```

- Each chunk has its own salt + IV — no key/nonce reuse
- Password set once: `clawkeep backup set-password <password>` or env `CLAWKEEP_PASSWORD`
- Password hash (for verification, not the password itself) stored in `.clawkeep/config.json` as `backup.passwordHash`

### Manifest

The manifest is an encrypted JSON file containing:

```json
{
  "version": 1,
  "workspaceId": "clawd-a8f3c2d1",
  "createdAt": "2026-02-05T21:00:00Z",
  "chunks": [
    {
      "id": "chunk-000001",
      "type": "full",
      "fromCommit": null,
      "toCommit": "abc1234",
      "commitCount": 25,
      "size": 149946368,
      "createdAt": "2026-02-05T21:00:00Z"
    },
    {
      "id": "chunk-000002",
      "type": "incremental",
      "fromCommit": "abc1234",
      "toCommit": "def5678",
      "commitCount": 5,
      "size": 4096,
      "createdAt": "2026-02-05T22:00:00Z"
    }
  ],
  "lastSync": "2026-02-05T22:00:00Z",
  "totalCommits": 30,
  "compactedAt": null
}
```

### Sync Flow

#### First Sync
1. Generate workspace ID if not set
2. Prompt/require password if not set
3. `git bundle create --all` → full bundle of entire history
4. Encrypt bundle → `chunk-000001.enc`
5. Create manifest → encrypt → `manifest.enc`
6. Write files to target path
7. Store last synced commit hash in `.clawkeep/config.json`

#### Incremental Sync (subsequent)
1. Read local config for `backup.lastSyncCommit`
2. Check if there are new commits since last sync: `git log <lastSyncCommit>..HEAD --oneline`
3. If no new commits → skip (already synced)
4. `git bundle create <range> <lastSyncCommit>..HEAD` → incremental bundle (only new commits)
5. Encrypt → `chunk-NNNNNN.enc`
6. Download + decrypt manifest → append new chunk entry → re-encrypt → upload manifest
7. Update local `backup.lastSyncCommit`

#### Size Expectations
- Initial full sync: ~size of git repo (compressed)
- Incremental after text file edit: 1-10 KB
- Incremental after adding large binary: ~size of binary
- Manifest: < 1 KB typically

### Restore Flow

1. Read + decrypt `manifest.enc` from target
2. Download all chunks in order
3. Decrypt each chunk → git bundle files
4. Create temp directory
5. `git clone <chunk-000001.bundle>` (base)
6. `git pull <chunk-000002.bundle>` (apply incrementals in order)
7. Copy working tree to destination
8. (Optional) Re-init ClawKeep on restored directory

### Compaction

Over time, many small incremental chunks accumulate. Compaction merges them:

1. Download + decrypt all chunks
2. Apply all bundles to get full repo
3. Create single new full bundle
4. Encrypt → new `chunk-000001.enc`
5. Delete old chunks
6. Update manifest

**When to compact:**
- Manual: `clawkeep backup compact`
- Auto: when chunk count exceeds 50 (configurable)
- On dashboard: "Compact backup" button in Backup tab

### Transport Layer

The chunk format is transport-agnostic. Each target type implements:

```javascript
class BackupTransport {
  async writeFile(remotePath, buffer) {}    // upload a chunk
  async readFile(remotePath) → buffer {}    // download a chunk
  async deleteFile(remotePath) {}           // remove old chunk
  async listFiles(remoteDir) → string[] {}  // list chunks
  async exists(remotePath) → boolean {}     // check if file exists
}
```

#### Target Implementations

All targets use the same encrypted chunk format. Git is NEVER exposed as a backup target — it is only the internal versioning engine. Users never see or interact with git.

**Local path** (`LocalTransport`):
- `fs.writeFile` / `fs.readFile` / `fs.unlink` / `fs.readdir`
- Works with any mounted path: NAS, USB drive, NFS, SMB

**S3/R2** (`S3Transport`) — future:
- `PutObject` / `GetObject` / `DeleteObject` / `ListObjectsV2`
- Same chunk format, S3 as storage

**ClawKeep Cloud** (`CloudTransport`) — future:
- HTTPS API to clawkeep.com
- Same chunk format, cloud storage backend
- Auth via API key

### CLI Changes

```bash
# Set encryption password (required before first sync)
clawkeep backup set-password
# → prompts for password interactively
# → or: CLAWKEEP_PASSWORD=xxx clawkeep backup set-password

# Configure local target (always encrypted)
clawkeep backup local /mnt/nas/backups
# → sets target, prompts for password if not set
# This is the ONLY way to back up. No git remotes exposed.

# Sync now
clawkeep backup sync
# → incremental encrypted sync

# Check status
clawkeep backup status
# → shows: target, last sync, chunk count, total size

# Compact chunks
clawkeep backup compact

# Restore from encrypted backup
clawkeep backup restore /mnt/nas/backups/workspace-id/
# → prompts for password → restores full history

# Test connection + verify manifest
clawkeep backup test
```

### Removed Commands

The following commands are REMOVED — git is internal only:

- `clawkeep push` — removed (use `clawkeep backup sync`)
- `clawkeep pull` — removed (use `clawkeep backup restore`)
- `clawkeep backup git <url>` — removed (no git remote target)

All remote sync goes through encrypted chunks. No exceptions.

### Dashboard Changes

**Backup tab updates:**
- Password setup: input field + "Set password" button (shows ✓ if already set)
- After sync: show chunk count, total backup size, last sync time
- "Sync now" button (existing, works with new system)
- "Compact" button (when chunk count > 10)
- "Download backup" → downloads all chunks as single .zip (for manual recovery)
- Remove direct encrypted export section (backup IS the encrypted export now)

**Protection status updates:**
- Show "Encrypted ✓" when password is set and target configured
- Show chunk count + last sync time
- Warn if password not set but target is configured

### Config Changes

`.clawkeep/config.json` additions:

```json
{
  "backup": {
    "target": "local",
    "workspaceId": "clawd-a8f3c2d1",
    "passwordHash": "$scrypt$...",
    "lastSyncCommit": "abc1234def5678...",
    "chunkCount": 3,
    "autoSync": true,
    "autoCompactThreshold": 50,
    "local": {
      "path": "/mnt/nas/backups"
    }
  }
}
```

**Note:** The actual password is NEVER stored. Only a hash for verification ("is this the right password?"). The encryption key is derived from the password at sync time.

### Security Considerations

- AES-256-GCM provides both confidentiality and integrity (tamper detection)
- Each chunk has unique salt + IV — compromising one doesn't help with others
- Password never stored, only hash for UX verification
- Manifest is encrypted too — even file counts/names are hidden
- Chunks are opaque — can't tell if it's code, images, or text
- No git metadata exposed on target — just numbered .enc files

### Migration from Current System

If a user already has a bare git mirror backup:
1. `clawkeep backup set-password` 
2. `clawkeep backup sync` → detects old format, creates fresh full encrypted sync
3. Old bare repo is NOT deleted (user can clean up manually)

### Implementation Order

1. **Crypto module** — `src/core/sync-crypto.js`: encrypt/decrypt chunk files with AES-256-GCM, scrypt KDF
2. **Transport interface** — `src/core/transport.js`: base class + `LocalTransport`
3. **SyncManager** — `src/core/sync.js`: manifest management, chunk creation, incremental logic
4. **CLI commands** — update `src/commands/backup.js`: set-password, sync, compact, restore-from-backup
5. **Dashboard API** — update `src/commands/ui.js`: new endpoints for password, sync status, compact
6. **Dashboard UI** — update `ui/app.js`: password setup, chunk info, compact button
7. **Tests** — round-trip: init → snap → sync → restore from chunks → verify files match

### File Inventory (new/modified)

**New files:**
- `src/core/sync-crypto.js` — AES-256-GCM encrypt/decrypt for chunks
- `src/core/sync.js` — SyncManager (manifest, chunks, incremental bundles)
- `src/core/transport.js` — BackupTransport base + LocalTransport

**Modified files:**
- `src/core/backup.js` — wire SyncManager into existing backup flow
- `src/commands/backup.js` — add set-password, compact, restore subcommands
- `src/commands/ui.js` — new API routes for password, sync details, compact
- `ui/app.js` — Backup tab: password setup, chunk info, compact button
- `bin/clawkeep.js` — no changes needed (backup command already handles subcommands)
