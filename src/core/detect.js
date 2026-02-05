'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Auto-detect which agent framework is in use.
 * Returns framework info for config.
 */
function detectFramework(dir) {
  dir = path.resolve(dir);

  // Clawdbot — look for AGENTS.md, SOUL.md, or clawdbot config
  if (
    fs.existsSync(path.join(dir, 'AGENTS.md')) ||
    fs.existsSync(path.join(dir, 'SOUL.md')) ||
    fs.existsSync(path.join(dir, 'MEMORY.md'))
  ) {
    const agentName = _extractAgentName(dir, 'clawdbot');
    return {
      framework: 'clawdbot',
      agentName,
      dataFiles: ['MEMORY.md', 'SOUL.md', 'AGENTS.md', 'USER.md', 'TOOLS.md', 'IDENTITY.md', 'HEARTBEAT.md'],
      memoryDir: 'memory/',
    };
  }

  // OpenClaw — look for .openclaw directory or config
  if (
    fs.existsSync(path.join(dir, '.openclaw')) ||
    fs.existsSync(path.join(dir, 'config.json'))
  ) {
    const agentName = _extractAgentName(dir, 'openclaw');
    return {
      framework: 'openclaw',
      agentName,
      dataFiles: ['config.json', 'memory.md'],
      memoryDir: 'framework/',
    };
  }

  // Nanobot — look for nanobot.yml or .nanobot
  if (
    fs.existsSync(path.join(dir, 'nanobot.yml')) ||
    fs.existsSync(path.join(dir, '.nanobot'))
  ) {
    const agentName = _extractAgentName(dir, 'nanobot');
    return {
      framework: 'nanobot',
      agentName,
      dataFiles: ['nanobot.yml'],
      memoryDir: 'state/',
    };
  }

  // Claude Code / Anthropic — look for CLAUDE.md
  if (fs.existsSync(path.join(dir, 'CLAUDE.md'))) {
    return {
      framework: 'claude-code',
      agentName: 'claude',
      dataFiles: ['CLAUDE.md'],
      memoryDir: null,
    };
  }

  // Codex — look for AGENTS.md pattern (OpenAI)
  if (fs.existsSync(path.join(dir, 'codex.md'))) {
    return {
      framework: 'codex',
      agentName: 'codex',
      dataFiles: ['codex.md'],
      memoryDir: null,
    };
  }

  // Generic / unknown
  return {
    framework: 'generic',
    agentName: path.basename(dir),
    dataFiles: [],
    memoryDir: null,
  };
}

/** Try to extract the agent's name from config files */
function _extractAgentName(dir, framework) {
  try {
    if (framework === 'clawdbot') {
      // Try IDENTITY.md
      const identPath = path.join(dir, 'IDENTITY.md');
      if (fs.existsSync(identPath)) {
        const content = fs.readFileSync(identPath, 'utf8');
        const match = content.match(/\*\*Name:\*\*\s*(.+)/);
        if (match) return match[1].trim();
      }
    }

    if (framework === 'openclaw') {
      const configPath = path.join(dir, '.openclaw', 'config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.name) return config.name;
      }
      // Fallback: config.json in root
      const rootConfig = path.join(dir, 'config.json');
      if (fs.existsSync(rootConfig)) {
        const config = JSON.parse(fs.readFileSync(rootConfig, 'utf8'));
        if (config.name) return config.name;
        if (config.agent_name) return config.agent_name;
      }
    }

    if (framework === 'nanobot') {
      const nanobotPath = path.join(dir, 'nanobot.yml');
      if (fs.existsSync(nanobotPath)) {
        const content = fs.readFileSync(nanobotPath, 'utf8');
        const match = content.match(/name:\s*(.+)/);
        if (match) return match[1].trim();
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  return path.basename(dir);
}

module.exports = { detectFramework };
