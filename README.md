<p align="center">
  <img src="assets/banner.jpg" alt="ClawKeep" width="100%" />
</p>

<h1 align="center">🐾 ClawKeep</h1>

<p align="center">
  <strong>Git-powered time travel for your files.</strong><br>
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

ClawKeep gives your files **full version history**. Every change is tracked. Every state is recoverable. Built on git, but you never touch git.

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
  Snapshot    a8f3c2d1
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
| `clawkeep snap` | Manual snapshot with optional `-m "message"` |
| `clawkeep log` | Browse your version timeline |
| `clawkeep restore <ref>` | Time-travel to any snapshot |
| `clawkeep diff` | See what changed since last snapshot |
| `clawkeep push` | Sync to GitHub, GitLab, or any git remote |
| `clawkeep pull` | Pull latest from remote |
| `clawkeep export` | AES-256 encrypted portable archive |
| `clawkeep import` | Restore from encrypted archive |
| `clawkeep status` | Show tracking stats |
| `clawkeep ui` | Launch the web dashboard |

## Web Dashboard

A clean, dark-themed dashboard to browse your version history visually.

```bash
clawkeep ui --daemon --port 3333
```

**What you get:**
- 📋 **Timeline** — every snapshot with expandable diffs
- 📁 **File browser** — browse files at any point in history
- 🔀 **Compare** — select any two snapshots and see exactly what changed
- ⏪ **One-click restore** — revert to any snapshot from the UI
- ✏️ **Named snapshots** — label important checkpoints
- 🎨 **Syntax highlighting** — JS, Python, Go, Rust, JSON, YAML, CSS, HTML

Token-based auth. Runs as a background daemon. Auto-refreshes.

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
- Run watch mode or periodic snapshots via heartbeat
- Restore to previous versions when something goes wrong
- Take named snapshots before risky operations

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

The killer feature. Background daemon that auto-snapshots on file changes:

```bash
# Foreground (see live output)
clawkeep watch

# Background daemon (survives terminal close)
clawkeep watch --daemon

# Stop the daemon
clawkeep watch --stop

# Auto-push to remote after each snap
clawkeep watch --daemon --push
```

Debounced writes, stability detection, smart ignore patterns. Your files are continuously versioned without any manual intervention.

## Restore

Go back to any point in time. Your current state is preserved in history — nothing is ever lost.

```bash
# See the timeline
clawkeep log

# Restore to a specific snapshot
clawkeep restore abc123f

# Restore to 3 snapshots ago
clawkeep restore HEAD~3
```

Restores are **non-destructive** — ClawKeep checks out the old state and commits it as a new snapshot. Your full history is always intact.

## Compare

See exactly what changed between any two points in time:

- **Dashboard:** Click two commits in the timeline to compare
- **CLI:** `clawkeep diff` shows changes since last snapshot
- **API:** `GET /api/compare?from=abc123&to=def456`

## Encrypted Export

Portable, encrypted backup of your entire version history:

```bash
clawkeep export -p "strong-password"
# → project-2026-02-05.clawkeep.enc (AES-256-CTR + scrypt)

clawkeep import backup.clawkeep.enc -p "strong-password"
```

Or use the `CLAWKEEP_PASSWORD` environment variable for automated exports.

## Programmatic API

```javascript
const { ClawGit } = require('clawkeep');

const claw = new ClawGit('/path/to/project');
await claw.init();

// Snapshot
const snap = await claw.snap('pre-deploy checkpoint');

// History
const history = await claw.log(10);

// Diff between any two commits
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
| Encrypted export | Not built-in | `clawkeep export` |
| Learning curve | Steep | Three commands |

ClawKeep *is* git underneath. You get all the power with none of the ceremony.

## Roadmap

- [ ] `clawkeep.com` — hosted dashboard & remote storage
- [ ] Webhooks on file changes
- [ ] S3/R2 backend support
- [ ] Multi-directory sync

## License

MIT — [ClawKeep](https://clawkeep.com) 🐾
