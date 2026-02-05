<p align="center">
  <img src="assets/banner.jpg" alt="ClawKeep" width="100%" />
</p>

<h1 align="center">🐾 ClawKeep</h1>

<p align="center">
  <strong>Time-travel backups for AI agents and everything else.</strong><br>
  <sub>Every change tracked. Every version recoverable. Set it and forget it.</sub>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/clawkeep"><img src="https://img.shields.io/npm/v/clawkeep.svg?style=flat-square&color=38bdf8" alt="npm"></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-38bdf8.svg?style=flat-square" alt="license"></a>
  <a href="#quick-start"><img src="https://img.shields.io/badge/setup-30_seconds-38bdf8.svg?style=flat-square" alt="setup"></a>
</p>

---

## The Problem

You're running an AI agent. It rewrites its own memory files, edits configs, updates state. One bad run and your agent's personality is gone. Its memory, corrupted. Its config, overwritten.

You reach for a backup. All you have is a zip from three days ago.

**That's not enough.**

## The Solution

ClawKeep gives your files **full version history with encrypted backups**. Every change is tracked. Every state is recoverable. Back up to a local path, S3, or (soon) ClawKeep Cloud — all encrypted, all incremental. Built on git internally, but you never touch git.

```
clawkeep init       →  start tracking
clawkeep watch      →  auto-backup on every change
clawkeep restore    →  go back to any point in time
```

That's it. Three commands. Your files are protected forever.

## Quick Start

```bash
npm install -g clawkeep
```

```bash
cd ~/my-project
clawkeep init
```
```
✔ ClawKeep initialized!
  🐾 Directory is now version-controlled
  Tracked     42 files
  Backup      a8f3c2d1
```

```bash
# Set it and forget it — runs in background
clawkeep watch --daemon
```

Done. Every file change is now automatically versioned.

## Commands

| Command | What it does |
|---|---|
| `clawkeep init` | Start tracking a directory |
| `clawkeep watch` | Auto-backup on file changes. `--daemon` for background mode |
| `clawkeep snap` | Manual backup with optional `-m "message"` |
| `clawkeep log` | Browse your backup timeline |
| `clawkeep restore <ref>` | Time-travel to any backup |
| `clawkeep diff` | See what changed since last backup |
| `clawkeep backup` | Manage encrypted backup targets (local, S3, cloud) |
| `clawkeep backup sync` | Sync encrypted backup to target |
| `clawkeep backup restore` | Restore from encrypted backup |
| `clawkeep export` | AES-256 encrypted portable archive |
| `clawkeep import` | Restore from encrypted archive |
| `clawkeep status` | Show tracking stats |
| `clawkeep ui` | Launch the web dashboard |

## Backup Targets

Choose where your data goes. Configure once, sync automatically.

```bash
# Set encryption password (once)
clawkeep backup set-password

# Back up to a local path (NAS, external drive, etc.)
clawkeep backup local /mnt/nas/backups

# Sync (incremental — only new changes)
clawkeep backup sync

# Check backup status
clawkeep backup status

# Restore from backup
clawkeep backup restore /mnt/nas/backups/my-workspace/
```

All backups are **AES-256-GCM encrypted** and **incremental** — only new changes are synced after the first backup.

| Target | Status | Description |
|---|---|---|
| **Local path** | ✅ Available | Encrypted chunks on any folder, NAS, or mounted drive |
| **S3 / R2** | 🔜 Coming soon | Encrypted chunks on object storage |
| **ClawKeep Cloud** | 🔜 Coming soon | Managed encrypted backup at clawkeep.com |

## Web Dashboard

A clean, dark-themed dashboard to manage your backups visually.

```bash
clawkeep ui --daemon --port 3333
```

**Four tabs, everything you need:**

- **◉ Dashboard** — Protection status, recent changes, pending unsaved files, quick stats
- **↻ History** — Full backup timeline with expandable diffs, compare any two backups side-by-side
- **☁ Backup** — Configure backup targets, sync, test connections, download encrypted exports
- **≡ Browse** — File browser with time-travel — view any file at any point in history

**Also includes:**
- 🎨 Syntax highlighting for JS, Python, Go, Rust, JSON, YAML, CSS, HTML
- ✏️ Named backups from the UI
- ⏪ One-click restore to any backup
- 🔐 Token-based auth, runs as a background daemon

## Framework Integrations

ClawKeep works with any directory, but it's especially useful for AI agent frameworks that maintain persistent state:

| Framework | What to track | How to integrate |
|---|---|---|
| **[Clawdbot](https://github.com/clawdbot/clawdbot)** | `MEMORY.md`, `SOUL.md`, `IDENTITY.md`, config, daily notes | Heartbeat task or watch daemon. See [SKILL.md](SKILL.md) |
| **[OpenClaw](https://github.com/openclaw)** | `.openclaw/` memory, agent state, tool configs | `clawkeep init && clawkeep watch --daemon` in agent dir |
| **[Nanobot](https://github.com/nicholasgriffintn/nanobot)** | `nanobot.yml`, conversation history, plugins | Watch daemon on nanobot workspace |
| **[Claude Code](https://claude.ai/code)** | `CLAUDE.md`, project context, session artifacts | `clawkeep watch --daemon` in project root |
| **[Codex CLI](https://github.com/openai/codex)** | `codex.md`, workspace files | Watch daemon on workspace |
| **[CrewAI](https://github.com/joaomdmoura/crewAI)** | Agent memory, task outputs, crew configs | Watch daemon on crew workspace |
| **[AutoGPT](https://github.com/Significant-Gravitas/AutoGPT)** | Agent state, auto_gpt_workspace, memory | Watch daemon on workspace root |
| **Generic** | Any directory with files that change | `clawkeep init && clawkeep watch --daemon` |

### Agent Skill

ClawKeep ships with a [SKILL.md](SKILL.md) that any AI agent can read and follow. Drop it into your agent's skills directory and it will know how to:

- Initialize ClawKeep on its own workspace
- Run watch mode or periodic backups via heartbeat
- Restore to previous versions when something goes wrong
- Take named backups before risky operations
- Configure backup targets for offsite protection

See [SKILL.md](SKILL.md) for the full agent-readable integration guide.

## Smart Ignore

ClawKeep ships with sensible defaults. Your `node_modules`, build artifacts, and caches are never tracked:

```bash
# .clawkeepignore (auto-generated)
node_modules/
__pycache__/
dist/
.env
*.log
```

Add your own patterns. They're automatically synced to `.gitignore` — you never think about it.

## Watch Mode

The killer feature. Background daemon that auto-backs-up on file changes:

```bash
# Foreground (see live output)
clawkeep watch

# Background daemon (survives terminal close)
clawkeep watch --daemon

# Stop the daemon
clawkeep watch --stop

# Auto-push to remote after each backup
clawkeep watch --daemon --push
```

Debounced writes, stability detection, smart ignore patterns. Your files are continuously versioned without any manual intervention.

## Restore

Go back to any point in time. Your current state is preserved in history — nothing is ever lost.

```bash
# See the timeline
clawkeep log

# Restore to a specific backup
clawkeep restore abc123f

# Restore to 3 backups ago
clawkeep restore HEAD~3
```

Restores are **non-destructive** — ClawKeep checks out the old state and creates a new backup. Your full history is always intact.

## Compare

See exactly what changed between any two points in time:

- **Dashboard:** Click "Compare" in History tab, select two backups
- **CLI:** `clawkeep diff` shows changes since last backup
- **API:** `GET /api/compare?from=abc123&to=def456`

## Encrypted by Default

All backups are AES-256-GCM encrypted with scrypt key derivation. Your data is opaque on the target — no file names, no git history, nothing readable. Just numbered `.enc` chunks.

```bash
# One-off encrypted export (portable archive)
clawkeep export -p "strong-password"

# Import from archive
clawkeep import backup.clawkeep.enc -p "strong-password"
```

## Programmatic API

```javascript
const { ClawGit } = require('clawkeep');

const claw = new ClawGit('/path/to/project');
await claw.init();

// Backup
const snap = await claw.snap('pre-deploy checkpoint');

// History
const history = await claw.log(10);

// Diff between any two backups
const changes = await claw.diffBetween('abc123', 'def456');

// Restore
await claw.restore('abc123');

// Time-travel file browsing
const files = await claw.listFilesAtCommit('abc123', 'memory/');
const content = await claw.showFileAtCommit('abc123', 'MEMORY.md');
```

## Built for AI Agents, Works for Everything

ClawKeep was built because AI agents break their own files. But it works for anything:

- **AI agent memory & config** — the original use case
- **Dotfiles** — version your shell config without thinking
- **Writing projects** — every draft saved, every version recoverable
- **Config management** — track infrastructure config changes over time
- **Any directory** — if files change, ClawKeep can track them

## Why Not Just Git?

You *could* set up git, write a cron job, handle `.gitignore`, remember to commit, deal with merge conflicts, configure remotes...

Or you could run `clawkeep watch --daemon` and never think about it again.

| | Raw git | ClawKeep |
|---|---|---|
| Setup | Multiple commands | `clawkeep init` |
| Auto-backup | DIY cron/hooks | `clawkeep watch --daemon` |
| Ignore patterns | Manual `.gitignore` | Auto-managed `.clawkeepignore` |
| Time travel | `git checkout` / `git stash` | `clawkeep restore` |
| Visual history | External GUI needed | Built-in web dashboard |
| Backup targets | Manual remote config | `clawkeep backup local /path` (encrypted) |
| Encrypted export | Not built-in | `clawkeep export` |
| Learning curve | Steep | Three commands |

ClawKeep *is* git underneath. You get all the power with none of the ceremony.

## Roadmap

- [ ] `clawkeep.com` — hosted dashboard & remote storage
- [ ] S3/R2 backend support
- [ ] Webhooks on file changes
- [ ] Multi-directory sync
- [ ] Team sharing & access control

## License

MIT — [ClawKeep](https://clawkeep.com) 🐾
