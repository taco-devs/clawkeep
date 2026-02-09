<p align="center">
  <img src="assets/banner.jpg" alt="ClawKeep" width="100%" />
</p>

<h1 align="center">🐾 ClawKeep</h1>

<p align="center">
  <strong>Private, encrypted backups that just work.</strong><br>
  <sub>Zero-knowledge. Time-travel restore. Set it and forget it.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/clawkeep"><img src="https://img.shields.io/npm/v/clawkeep.svg?style=flat-square&color=38bdf8" alt="npm"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-38bdf8.svg?style=flat-square" alt="license"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/setup-30_seconds-38bdf8.svg?style=flat-square" alt="setup"></a>
</p>

---

## The Problem

Your files are precious. Your AI agent's memory. Your dotfiles. Your configs. Your writing.

One bad edit. One corrupted file. One accidental delete. Gone.

Cloud backups? They can read your data. Time Machine? No encryption. Manual exports? You'll forget.

**You need backups that are automatic, encrypted, and private.**

## The Solution

ClawKeep gives you **continuous, encrypted backups** with full version history. Every change is captured. Every version is recoverable. Everything is **AES-256 encrypted** before it leaves your machine.

```
clawkeep init       →  start protecting a directory
clawkeep watch      →  auto-backup every change (encrypted)
clawkeep restore    →  go back to any point in time
```

Three commands. Your files are protected forever. **Nobody can read them but you.**

## 🔐 Privacy First

ClawKeep is built on a simple principle: **your data is yours**.

- **AES-256-GCM encryption** — Military-grade encryption for all backups
- **Zero-knowledge** — Your backup target only sees numbered `.enc` chunks
- **No file names leaked** — Directory structure, file names, everything encrypted
- **Local-first** — Works entirely offline, no account required
- **Open source** — Audit the code yourself

```
What your NAS/cloud sees:     What's actually inside:
├── chunk-000001.enc          ├── MEMORY.md
├── chunk-000002.enc          ├── config/
├── manifest.enc              │   ├── secrets.yaml
                              │   └── api-keys.json
                              └── notes/
                                  └── journal.md
```

**Your backup target learns nothing.** Not file names, not sizes, not structure. Just opaque encrypted blobs.

## Quick Start

```bash
npm install -g clawkeep
```

```bash
cd ~/my-important-files
clawkeep init
```
```
✔ ClawKeep initialized!
  🐾 Directory is now protected
  Tracked     42 files
  Backup      a8f3c2d1
```

```bash
# Set it and forget it — runs in background
clawkeep watch --daemon
```

Done. Every file change is now automatically versioned and ready for encrypted backup.

## Encrypted Backup Targets

Send your encrypted backups anywhere. They can't read them anyway.

```bash
# Set your encryption password (once)
clawkeep backup set-password

# Back up to a local path (NAS, external drive, USB)
clawkeep backup local /mnt/nas/backups

# Sync — only new changes are uploaded
clawkeep backup sync

# Check backup status
clawkeep backup status
```

Your backup target receives **encrypted chunks only**. No metadata. No history. Nothing useful without your password.

| Target | Status | Description |
|---|---|---|
| **Local path** | ✅ Available | Any mounted folder — NAS, USB drive, network share |
| **S3 / R2** | ✅ Available | Object storage (Cloudflare R2, AWS S3, MinIO, Backblaze B2, Wasabi) |
| **ClawKeep Cloud** | 🔜 Coming soon | Managed zero-knowledge backup |

### S3 / R2 Setup

```bash
# Configure S3-compatible target
clawkeep backup s3 \
  --endpoint https://your-account.r2.cloudflarestorage.com \
  --bucket my-backups \
  --access-key AKIAIOSFODNN7EXAMPLE \
  --secret-key wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY \
  --region auto \
  --prefix clawkeep/

# Or use environment variables for credentials
export CLAWKEEP_S3_ACCESS_KEY=your-access-key
export CLAWKEEP_S3_SECRET_KEY=your-secret-key
clawkeep backup s3 --endpoint https://... --bucket my-backups

# Sync encrypted chunks to S3
clawkeep backup sync
```

Works with any S3-compatible service: **Cloudflare R2** (zero egress fees), **AWS S3**, **Backblaze B2**, **MinIO**, **Wasabi**, and more.

## Commands

| Command | What it does |
|---|---|
| `clawkeep init` | Start protecting a directory |
| `clawkeep watch` | Auto-backup on file changes. `--daemon` for background |
| `clawkeep snap` | Manual backup with optional `-m "message"` |
| `clawkeep log` | Browse your backup timeline |
| `clawkeep restore <ref>` | Time-travel to any backup |
| `clawkeep diff` | See what changed since last backup |
| `clawkeep backup` | Manage encrypted backup targets |
| `clawkeep backup sync` | Push encrypted backup to target |
| `clawkeep backup restore` | Restore from encrypted backup |
| `clawkeep export` | Portable encrypted archive |
| `clawkeep import` | Restore from encrypted archive |
| `clawkeep status` | Show protection stats |
| `clawkeep ui` | Launch the web dashboard |

## Web Dashboard

A clean, dark-themed dashboard to manage your backups visually.

```bash
clawkeep ui --daemon --port 3333
```

**Four tabs, everything you need:**

- **◉ Dashboard** — Protection status, recent changes, pending files
- **↻ History** — Full timeline with diffs, compare any two points
- **☁ Backup** — Configure targets, sync, download encrypted exports
- **≡ Browse** — File browser with time-travel — view any file at any point

**Also includes:**
- 🎨 Syntax highlighting for code files
- ✏️ Named backups from the UI
- ⏪ One-click restore to any backup
- 🔐 Token-based auth

## Watch Mode

The killer feature. Continuous protection without thinking about it:

```bash
# Foreground (see live output)
clawkeep watch

# Background daemon (survives terminal close)
clawkeep watch --daemon

# Stop the daemon
clawkeep watch --stop

# Auto-sync to backup target after each change
clawkeep watch --daemon --push
```

Smart debouncing, stability detection, configurable ignore patterns. Your files are continuously protected.

## Time-Travel Restore

Go back to any point in time. Your current state is preserved — nothing is ever lost.

```bash
# See the timeline
clawkeep log

# Restore to a specific backup
clawkeep restore abc123f

# Restore to 3 backups ago
clawkeep restore HEAD~3
```

Restores are **non-destructive** — your full history is always intact.

## Portable Encrypted Archives

Take your backups anywhere with encrypted exports:

```bash
# Create encrypted archive
clawkeep export -p "your-password"
# → my-project.clawkeep.enc

# Restore on another machine
clawkeep import backup.clawkeep.enc -p "your-password"
```

One file. Fully encrypted. Restore anywhere.

## Built for AI Agents

ClawKeep was originally built to protect AI agent workspaces — memory files, personality configs, conversation history. One bad inference and your agent's identity is gone.

| Framework | What to protect |
|---|---|
| **[Clawdbot](https://github.com/clawdbot/clawdbot)** | `MEMORY.md`, `SOUL.md`, `IDENTITY.md`, daily notes |
| **[Claude Code](https://claude.ai/code)** | `CLAUDE.md`, project context, artifacts |
| **[CrewAI](https://github.com/joaomdmoura/crewAI)** | Agent memory, task outputs, crew configs |
| **[AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)** | Agent state, workspace, memory |
| **Any agent** | Memory, config, state files |

ClawKeep ships with a [SKILL.md](SKILL.md) that AI agents can read and follow autonomously.

## Works for Everything

AI agents are the origin story, but ClawKeep protects anything:

- **Dotfiles** — `~/.config`, shell rc files, SSH configs
- **Writing** — Manuscripts, notes, journals
- **Configs** — Server configs, infrastructure as code
- **Development** — Project files, local databases
- **Any directory** — If it changes, ClawKeep can protect it

## Smart Ignore

Sensible defaults out of the box:

```bash
# .clawkeepignore (auto-generated)
node_modules/
__pycache__/
dist/
.env
*.log
```

Add your own patterns. Large files and build artifacts stay out automatically.

## Programmatic API

```javascript
const { ClawKeep } = require('clawkeep');

const claw = new ClawKeep('/path/to/project');
await claw.init();

// Create backup
const snap = await claw.snap('before risky changes');

// Browse history
const history = await claw.log(10);

// Restore
await claw.restore('abc123');

// Time-travel file access
const oldContent = await claw.showFileAtCommit('abc123', 'config.yaml');
```

## Roadmap

- [x] S3 / R2 / MinIO backend
- [ ] `clawkeep.com` — zero-knowledge cloud backup
- [ ] End-to-end encrypted team sharing
- [ ] Webhooks on file changes
- [ ] Mobile app for backup status

## License

MIT — [ClawKeep](https://clawkeep.com) 🐾

---

<p align="center">
  <strong>Your files. Your encryption keys. Your privacy.</strong>
</p>
