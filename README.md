# 🐾 ClawKeep

**Git-backed memory persistence for AI agents.**

> Your agent's memory deserves version control, not just a zip file.

[![npm version](https://img.shields.io/npm/v/clawkeep.svg)](https://www.npmjs.com/package/clawkeep)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## The Problem

AI agents accumulate memory, config, and state over time. When something breaks — a bad update, corrupted memory, lost context — you need to go back. But most backup tools give you a single snapshot. A zip file. One point in time.

That's not enough.

## The Solution

ClawKeep gives your agent **full version-controlled history**. Every change tracked. Every state recoverable. Built on git, but with an agent-native UX.

```
  ● a8f3c2d1 — 🧠 memory(3) · ⚙️ config(1) — 4 files
  │ 2m ago
  │
  ○ 7b2e9f04 — 🧠 MEMORY.md updated
  │ 1h ago
  │
  ○ 3c1d8a5e — ✨ SOUL.md, IDENTITY.md
  │ 3h ago
  │
  ○ f9a2b7c3 — 🎉 initial snapshot
    1d ago
```

## Why ClawKeep?

| | Zip/tar backup | ClawKeep |
|---|---|---|
| **History** | Single snapshot | Full timeline |
| **Diffing** | ❌ | See exactly what changed |
| **Time travel** | Latest only | Any point in history |
| **Storage** | Full copy each time | Incremental (diffs only) |
| **Remote sync** | Manual upload | Built-in push/pull |
| **Auto-tracking** | ❌ | File watcher with auto-snap |
| **Secrets** | Excluded or plaintext | Included, encrypted on export |
| **Agent-aware** | Generic | Understands memory, soul, config |

## Quick Start

```bash
npm install -g clawkeep
```

```bash
# Initialize in your agent's directory
cd ~/my-agent
clawkeep init

# ✔ ClawKeep initialized!
#   🐾 Your agent's memory is now version-controlled
#   Framework   clawdbot
#   Agent       my-agent
#   Tracked     42 files
```

```bash
# Watch for changes (runs in background, auto-snaps)
clawkeep watch

# Or take manual snapshots
clawkeep snap -m "pre-deployment backup"

# See what changed
clawkeep diff

# View timeline
clawkeep log

# Go back in time
clawkeep restore HEAD~3

# Sync to remote
clawkeep push -r https://github.com/you/agent-memory.git

# Encrypted portable backup
clawkeep export -p "strong-password"
```

## Commands

| Command | What it does |
|---------|-------------|
| `clawkeep init` | Start tracking. Auto-detects your agent framework. |
| `clawkeep snap` | Take a snapshot. Auto-generates smart commit messages. |
| `clawkeep diff` | See what changed since last snapshot. |
| `clawkeep log` | Browse your snapshot timeline. |
| `clawkeep restore <ref>` | Time-travel to any snapshot. |
| `clawkeep push` | Sync to GitHub, GitLab, or any git remote. |
| `clawkeep pull` | Pull latest from remote. |
| `clawkeep watch` | Auto-snap on file changes. Set and forget. |
| `clawkeep export` | AES-256 encrypted archive of full history. |
| `clawkeep import` | Restore from encrypted archive. |
| `clawkeep status` | Dashboard: agent info, stats, pending changes. |

## Framework Support

ClawKeep auto-detects your agent:

| Framework | Detection |
|-----------|-----------|
| **OpenClaw** | `.openclaw/` directory |
| **Clawdbot** | `AGENTS.md`, `SOUL.md`, `MEMORY.md` |
| **Nanobot** | `nanobot.yml` |
| **Claude Code** | `CLAUDE.md` |
| **Codex** | `codex.md` |
| **Generic** | Any directory — just works |

## Smart Commit Messages

ClawKeep auto-categorizes changes:

```
🧠 memory(3) · ⚙️ config(1) — 4 files     # Multiple categories
🧠 MEMORY.md updated                        # Single memory file
✨ SOUL.md, IDENTITY.md                     # Soul/identity changes
⚙️ config.json updated                      # Config changes
📁 workspace(5) — 5 files                   # Code/script changes
```

## Secrets: Included by Default

Most backup tools exclude secrets. We don't.

Your agent's full state matters — API keys, credentials, wallet files. ClawKeep tracks everything because:

- **Local snapshots** stay on your machine
- **Remote push** goes to your private repo
- **Encrypted export** uses AES-256-CTR + scrypt key derivation
- **Opt out** anytime via `.clawkeepignore`

```bash
# Export with encryption
clawkeep export -p "correct-horse-battery-staple"

# Or use env var for automation
CLAWKEEP_PASSWORD="..." clawkeep export
```

## Watch Mode

The killer feature. Set it and forget it.

```bash
clawkeep watch --interval 5000 --push
```

Watches for file changes, debounces writes, auto-snapshots, and optionally pushes to remote. Your agent's memory is continuously backed up without any manual intervention.

Perfect for agents that continuously update their memory files.

## Programmatic API

```javascript
const { ClawGit, detectFramework } = require('clawkeep');

// Initialize
const claw = new ClawGit('/path/to/agent');
await claw.init({ framework: 'openclaw', agentName: 'my-agent' });

// Snapshot
const snap = await claw.snap('memory updated');
console.log(snap.hash, snap.summary);

// History
const history = await claw.log(10);

// Diff
const changes = await claw.diff();

// Restore
await claw.restore('abc123f');
```

## Roadmap

- [ ] `clawkeep.com` — hosted remote with dashboard
- [ ] Web UI for browsing agent memory timelines
- [ ] Multi-agent sync and shared memory
- [ ] Webhooks on memory changes
- [ ] S3/R2 backend support

## License

MIT — [ClawKeep](https://clawkeep.com) 🐾
