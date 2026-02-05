# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClawKeep is a git-backed memory persistence system for AI agents. It wraps git with agent-native semantics — version-controlled snapshots of memory, config, and state with smart commit messages, framework auto-detection, encrypted export, and a web dashboard.

## Commands

```bash
# Run (CLI entry point)
node bin/clawkeep.js <command>

# Install globally for development
npm link

# Tests (not yet implemented — placeholder in package.json)
npm test            # runs node test/run.js

# Lint (not yet implemented)
npm run lint
```

## Architecture

```
bin/clawkeep.js          # CLI entry point (Commander.js)
  ├── src/commands/*.js  # One module per CLI command
  ├── src/core/git.js    # ClawGit class — wraps simple-git with agent semantics
  ├── src/core/detect.js # Framework auto-detection (Clawdbot, OpenClaw, Nanobot, Claude Code, Codex, Generic)
  └── src/core/crypto.js # AES-256-CTR encryption with scrypt key derivation
ui/                      # Vanilla JS web dashboard (no framework, no build step)
```

### ClawGit (`src/core/git.js`)

Central class that wraps `simple-git`. All commands go through this. Key behaviors:
- `snap()` stages all changes, auto-generates emoji-categorized commit messages (🧠 memory, ✨ soul/identity, ⚙️ config, 📁 workspace, 📝 other)
- Always operates on `main` branch — intentionally linear history, no branching
- `getStats()` computes tracking duration, snap count, tracked file count from git history
- Config stored in `.clawkeep/config.json`; auth token in `.clawkeep/ui.token`; daemon PID in `.clawkeep/ui.pid`

### CLI Commands

All commands support `-d <dir>` to target a different directory. Each checks `claw.isInitialized()` first.

`init` · `snap` · `diff` · `log` · `restore` · `push` · `pull` · `watch` · `export` · `import` · `status` · `ui`

### Web Dashboard (`src/commands/ui.js` + `ui/`)

Raw Node.js HTTP server (no Express). Token-based auth. API at `/api/` with endpoints for status, log, diff, files, file content, commit details, and snap. Supports `--daemon` mode with PID file management. Static files served from `ui/` directory with directory traversal protection.

### Framework Detection (`src/core/detect.js`)

Scans the target directory for signature files (e.g., `AGENTS.md`/`SOUL.md` → Clawdbot, `.openclaw/` → OpenClaw, `nanobot.yml` → Nanobot, `CLAUDE.md` → Claude Code). Returns framework name, detected agent name, and list of key files.

### Encryption (`src/core/crypto.js`)

Export creates a `[salt:16][iv:16][encrypted tar.gz]` file using AES-256-CTR with scrypt-derived keys. Import reverses this. Password via `-p` flag or `CLAWKEEP_PASSWORD` env var.

## Key Patterns

- Pure Node.js (no TypeScript, no build step) — all source is plain `.js` with strict mode
- Uses `chalk` 4.x (CommonJS), `ora` 5.x (CommonJS), `commander` 12.x for CLI
- `chokidar` watches files in `watch` command with debounce (default 5s) and stability threshold
- Error handling: spinner fail + `process.exit(1)` on errors; user-friendly messages via chalk
- No test framework configured yet — `test/` directory does not exist
