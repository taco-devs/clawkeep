# SPEC: S3/R2 Backup Target Integration

## Overview

Add S3-compatible object storage as a backup target for ClawKeep. This enables users to back up encrypted chunks to Cloudflare R2, AWS S3, Backblaze B2, MinIO, or any S3-compatible service.

## Goals

1. **S3-compatible** — Work with any S3-compatible API (R2, S3, B2, MinIO, Wasabi)
2. **Zero dependencies on AWS SDK** — Use lightweight S3 client or raw HTTP with AWS Signature V4
3. **Same encryption model** — Encrypted chunks, identical to local backup target
4. **Incremental sync** — Only upload new/changed chunks
5. **Resume support** — Handle interrupted uploads gracefully

## User Experience

### Configuration

```bash
# Configure S3/R2 target
clawkeep backup s3 \
  --endpoint https://xxx.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key AKIAXXXXXXXX \
  --secret-key xxxxxxxx \
  --region auto

# Or via environment variables
export CLAWKEEP_S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
export CLAWKEEP_S3_BUCKET=my-backups
export CLAWKEEP_S3_ACCESS_KEY=AKIAXXXXXXXX
export CLAWKEEP_S3_SECRET_KEY=xxxxxxxx
clawkeep backup s3

# Sync to S3
clawkeep backup sync

# Check status
clawkeep backup status
```

### Config Storage

Store S3 config in `.clawkeep/config.json`:

```json
{
  "backup": {
    "target": "s3",
    "s3": {
      "endpoint": "https://xxx.r2.cloudflarestorage.com",
      "bucket": "my-backups",
      "prefix": "clawkeep/workspace-id/",
      "region": "auto",
      "accessKey": "AKIAXXXXXXXX",
      "secretKey": "ENCRYPTED:xxxx"
    }
  }
}
```

**Note:** `secretKey` should be encrypted using the user's backup password before storing.

## Technical Design

### File Structure on S3

```
s3://my-bucket/clawkeep/{workspace-id}/
├── manifest.enc          # Encrypted manifest (chunk list, metadata)
├── chunk-000001.enc      # Encrypted data chunk
├── chunk-000002.enc
├── chunk-000003.enc
└── ...
```

Same structure as local backup target — just on S3.

### Sync Algorithm

1. **Read local manifest** — Get list of chunks that should exist
2. **List remote objects** — `ListObjectsV2` to get existing chunks
3. **Diff** — Determine which chunks need uploading
4. **Upload missing chunks** — `PutObject` for each new chunk
5. **Upload manifest** — `PutObject` manifest.enc (always last)
6. **Verify** — Optional `HeadObject` to confirm uploads

### S3 Operations Required

| Operation | Use Case |
|-----------|----------|
| `PutObject` | Upload chunks and manifest |
| `GetObject` | Download chunks during restore |
| `HeadObject` | Check if chunk exists, verify uploads |
| `ListObjectsV2` | List existing chunks for diff |
| `DeleteObject` | Clean up old chunks (optional, for retention policy) |

### AWS Signature V4

Implement AWS Signature V4 signing for HTTP requests. This is required for all S3-compatible services.

**Option A:** Use `@aws-sdk/signature-v4` package (lightweight, just signing)
**Option B:** Implement signing manually (fewer deps, ~200 lines)

Recommend **Option A** for reliability — just the signature package, not the full AWS SDK.

```javascript
// Example using @aws-sdk/signature-v4
const { SignatureV4 } = require('@aws-sdk/signature-v4');
const { Sha256 } = require('@aws-crypto/sha256-js');

const signer = new SignatureV4({
  service: 's3',
  region: 'auto',
  credentials: { accessKeyId, secretAccessKey },
  sha256: Sha256
});

const signedRequest = await signer.sign(request);
```

### Provider-Specific Notes

#### Cloudflare R2
- Endpoint: `https://{account-id}.r2.cloudflarestorage.com`
- Region: `auto` (R2 ignores region, but signature needs it)
- No egress fees
- Supports all required operations

#### AWS S3
- Endpoint: `https://s3.{region}.amazonaws.com`
- Region: Required (e.g., `us-east-1`)
- Standard S3 behavior

#### Backblaze B2 (S3-compatible)
- Endpoint: `https://s3.{region}.backblazeb2.com`
- Region: e.g., `us-west-004`
- Requires `b2-` prefix for some headers

#### MinIO
- Endpoint: User-provided (e.g., `https://minio.example.com`)
- Region: Usually `us-east-1` or custom
- Self-hosted, fully S3-compatible

### Implementation Files

```
src/
├── core/
│   ├── s3-client.js      # Lightweight S3 client with SigV4
│   └── s3-transport.js   # S3 transport for backup system
├── commands/
│   └── backup.js         # Add 's3' subcommand handling
```

### New File: `src/core/s3-client.js`

```javascript
/**
 * Lightweight S3 client with AWS Signature V4
 * 
 * Supports: PutObject, GetObject, HeadObject, ListObjectsV2, DeleteObject
 * Works with: R2, S3, B2, MinIO, Wasabi, any S3-compatible service
 */

class S3Client {
  constructor({ endpoint, bucket, region, accessKey, secretKey }) {
    this.endpoint = endpoint;
    this.bucket = bucket;
    this.region = region || 'auto';
    this.accessKey = accessKey;
    this.secretKey = secretKey;
  }

  async putObject(key, body, contentType = 'application/octet-stream') {}
  async getObject(key) {}
  async headObject(key) {}
  async listObjects(prefix) {}
  async deleteObject(key) {}
}
```

### New File: `src/core/s3-transport.js`

```javascript
/**
 * S3 transport adapter for backup system
 * Implements same interface as local transport
 */

class S3Transport {
  constructor(s3Client, prefix) {
    this.s3 = s3Client;
    this.prefix = prefix; // e.g., 'clawkeep/workspace-id/'
  }

  async writeChunk(chunkName, encryptedData) {
    await this.s3.putObject(this.prefix + chunkName, encryptedData);
  }

  async readChunk(chunkName) {
    return await this.s3.getObject(this.prefix + chunkName);
  }

  async listChunks() {
    const objects = await this.s3.listObjects(this.prefix);
    return objects.map(obj => obj.Key.replace(this.prefix, ''));
  }

  async chunkExists(chunkName) {
    try {
      await this.s3.headObject(this.prefix + chunkName);
      return true;
    } catch (e) {
      return false;
    }
  }

  async writeManifest(encryptedManifest) {
    await this.s3.putObject(this.prefix + 'manifest.enc', encryptedManifest);
  }

  async readManifest() {
    return await this.s3.getObject(this.prefix + 'manifest.enc');
  }
}
```

### Modify: `src/commands/backup.js`

Add `s3` subcommand:

```javascript
} else if (subcommand === 's3') {
  // Parse S3 config from args or env
  const endpoint = opts.endpoint || process.env.CLAWKEEP_S3_ENDPOINT;
  const bucket = opts.bucket || process.env.CLAWKEEP_S3_BUCKET;
  const accessKey = opts.accessKey || process.env.CLAWKEEP_S3_ACCESS_KEY;
  const secretKey = opts.secretKey || process.env.CLAWKEEP_S3_SECRET_KEY;
  const region = opts.region || process.env.CLAWKEEP_S3_REGION || 'auto';

  // Validate required fields
  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.error('Missing required S3 config. Provide via flags or env vars.');
    process.exit(1);
  }

  // Test connection
  const s3 = new S3Client({ endpoint, bucket, region, accessKey, secretKey });
  await s3.listObjects(''); // Simple connectivity test

  // Save config (encrypt secretKey)
  bm.setS3Config({ endpoint, bucket, region, accessKey, secretKey });
  
  console.log('S3 backup target configured');
}
```

### Modify: `src/core/sync.js`

Add S3 transport support:

```javascript
function getTransport(config) {
  if (config.backup.target === 'local') {
    return new LocalTransport(config.backup.local.path);
  } else if (config.backup.target === 's3') {
    const s3 = new S3Client(config.backup.s3);
    const prefix = config.backup.s3.prefix || `clawkeep/${config.backup.workspaceId}/`;
    return new S3Transport(s3, prefix);
  }
  throw new Error(`Unknown backup target: ${config.backup.target}`);
}
```

## Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@aws-sdk/signature-v4": "^3.0.0",
    "@aws-crypto/sha256-js": "^5.0.0"
  }
}
```

These are lightweight packages (~50KB total) that only handle signing, not the full AWS SDK.

## Testing

### Unit Tests

```javascript
// test/s3-client.test.js
describe('S3Client', () => {
  it('should sign requests with AWS Signature V4');
  it('should put and get objects');
  it('should list objects with prefix');
  it('should handle 404 on headObject gracefully');
});
```

### Integration Tests

```javascript
// test/s3-integration.test.js
// Requires: CLAWKEEP_TEST_S3_* env vars

describe('S3 Backup Integration', () => {
  it('should configure S3 target');
  it('should sync encrypted chunks to S3');
  it('should restore from S3 backup');
  it('should handle incremental sync (only new chunks)');
});
```

### Manual Testing with R2

```bash
# Set up test bucket on R2
# Get credentials from Cloudflare dashboard

export CLAWKEEP_S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
export CLAWKEEP_S3_BUCKET=clawkeep-test
export CLAWKEEP_S3_ACCESS_KEY=xxx
export CLAWKEEP_S3_SECRET_KEY=xxx

cd /tmp/test-workspace
clawkeep init
echo "test" > file.txt
clawkeep snap -m "test backup"

clawkeep backup set-password -p testpass
clawkeep backup s3
clawkeep backup sync

# Verify on R2 dashboard or via AWS CLI:
aws s3 ls s3://clawkeep-test/clawkeep/ --endpoint-url $CLAWKEEP_S3_ENDPOINT
```

## Error Handling

| Error | Handling |
|-------|----------|
| Invalid credentials | Clear error message, prompt to reconfigure |
| Bucket not found | Suggest creating bucket, provide instructions |
| Network timeout | Retry with exponential backoff (3 attempts) |
| Upload interrupted | Resume from last successful chunk |
| Rate limiting (429) | Respect `Retry-After` header, backoff |

## Security Considerations

1. **Secret key storage** — Encrypt `secretKey` in config using backup password
2. **Never log credentials** — Redact in all log output
3. **HTTPS only** — Reject non-HTTPS endpoints (except localhost for MinIO dev)
4. **Chunk encryption** — Same AES-256-GCM as local backup, encryption happens before upload

## Future Enhancements (Out of Scope)

- [ ] Multipart upload for large chunks (>100MB)
- [ ] Parallel chunk uploads
- [ ] Bandwidth throttling
- [ ] Storage class selection (S3 Glacier, R2 Infrequent Access)
- [ ] Retention policy / automatic cleanup of old chunks
- [ ] Cross-region replication

## Acceptance Criteria

- [ ] `clawkeep backup s3` configures S3/R2 target
- [ ] `clawkeep backup sync` uploads encrypted chunks to S3
- [ ] `clawkeep backup restore` downloads and decrypts from S3
- [ ] Works with Cloudflare R2 (primary target)
- [ ] Works with AWS S3
- [ ] Works with MinIO (for local testing)
- [ ] Incremental sync only uploads new chunks
- [ ] Credentials stored encrypted in config
- [ ] Clear error messages for common issues
