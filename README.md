# ClawKeep 🐾

**Git-backed memory persistence for AI agents.**

Your agent's memory deserves version control, not just a zip file.

## What is ClawKeep?

ClawKeep gives AI agents full version-controlled history of their memory, config, and workspace. Every change is tracked. Every state is recoverable. Built on git, but with an agent-native UX — no git knowledge required.

## Why not just backup?

| Feature | Backup tools | ClawKeep |
|---------|-------------|----------|
| Snapshots | Single point-in-time | Full history |
| Diffing | ❌ | See exactly what changed |
| Time travel | Restore latest only | Restore any point |
| Incremental | Full copy each time | Only stores diffs |
| Remote sync | Manual | Built-in push/pull |
| File watching | ❌ | Auto-snap on changes |
| Secrets | Excluded by default | Included (encrypted on export) |

## Quick Start

```bash
npm install -g clawkeep

# Initialize in your agent's workspace
cd ~/.openclaw  # or your agent directory
clawkeep init

# Take a snapshot
clawkeep snap

# See what changed
clawkeep diff

# View history
clawkeep log

# Watch for changes (auto-snap)
clawkeep watch

# Push to remote
clawkeep push -r https://github.com/you/agent-memory.git

# Export encrypted archive
clawkeep export -p "your-password"
```

## Commands

| Command | Description |
|---------|-------------|
| `clawkeep init` | Initialize tracking in current directory |
| `clawkeep snap` | Take a snapshot of current state |
| `clawkeep diff` | Show changes since last snapshot |
| `clawkeep log` | Show snapshot history |
| `clawkeep restore <ref>` | Restore to a specific snapshot |
| `clawkeep push` | Push to remote repository |
| `clawkeep pull` | Pull from remote repository |
| `clawkeep watch` | Watch for changes and auto-snapshot |
| `clawkeep export` | Export encrypted archive |
| `clawkeep import` | Import from encrypted archive |
| `clawkeep status` | Show current tracking status |

## Framework Support

ClawKeep auto-detects your agent framework:

- **OpenClaw** — `.openclaw/` directory
- **Clawdbot** — `AGENTS.md`, `SOUL.md`, `MEMORY.md`
- **Nanobot** — `nanobot.yml`
- **Claude Code** — `CLAUDE.md`
- **Generic** — any directory

## Secrets

Unlike other backup tools, ClawKeep **includes secrets by default**. Your agent's full state matters — API keys, credentials, everything.

Secrets are safe because:
- Local snapshots stay on your machine
- Remote push goes to your private repo
- Encrypted export uses AES-256-CTR + scrypt
- You can opt out via `.clawkeepignore`

## Watch Mode

```bash
clawkeep watch --interval 5000 --push
```

Watches for file changes, debounces, and auto-snapshots. Perfect for agents that continuously update their memory. Add `--push` to auto-sync to remote after each snap.

## Encrypted Export

```bash
# Export with password
clawkeep export -p "strong-password"

# Or use environment variable
CLAWKEEP_PASSWORD="strong-password" clawkeep export

# Import on another machine
clawkeep import agent-backup.clawkeep.enc -p "strong-password"
```

Full history is preserved in the encrypted archive. AES-256-CTR with scrypt key derivation. Zero-knowledge — we never see your data.

## Programmatic Usage

```javascript
const { ClawGit, detectFramework } = require('clawkeep');

const claw = new ClawGit('/path/to/agent');
await claw.init({ framework: 'openclaw', agentName: 'my-agent' });
await claw.snap('memory updated after conversation');

const history = await claw.log(10);
console.log(history);
```

## License

MIT

---

Built by [ClawKeep](https://clawkeep.com) 🐾
