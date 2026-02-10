'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mutable for testing
let _credsDir = path.join(os.homedir(), '.clawkeep');
let _credsFile = path.join(_credsDir, 'credentials.json');

function _getDir() { return _credsDir; }
function _getFile() { return _credsFile; }

/**
 * Load global credentials (API key + endpoint).
 * Returns null if no credentials file or corrupted JSON.
 */
function loadCredentials() {
  try {
    if (!fs.existsSync(_getFile())) return null;
    const data = JSON.parse(fs.readFileSync(_getFile(), 'utf8'));
    if (!data.apiKey) return null;
    return {
      apiKey: data.apiKey,
      endpoint: data.endpoint || 'https://api.clawkeep.com',
    };
  } catch {
    return null;
  }
}

/**
 * Save global credentials.
 * @param {{ apiKey: string, endpoint?: string }} creds
 */
function saveCredentials(creds) {
  if (!fs.existsSync(_getDir())) {
    fs.mkdirSync(_getDir(), { recursive: true, mode: 0o700 });
  }
  const data = {
    apiKey: creds.apiKey,
    endpoint: creds.endpoint || 'https://api.clawkeep.com',
  };
  fs.writeFileSync(_getFile(), JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
}

/**
 * Remove global credentials file.
 */
function clearCredentials() {
  try {
    if (fs.existsSync(_getFile())) fs.unlinkSync(_getFile());
  } catch {
    // ignore
  }
}

/**
 * Override paths for testing.
 */
function _setTestPaths(dir, file) {
  _credsDir = dir;
  _credsFile = file;
}

module.exports = { loadCredentials, saveCredentials, clearCredentials, _setTestPaths };
