'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');

const creds = require('../src/core/credentials');

// Override to temp location
const TEST_DIR = path.join(os.tmpdir(), '.clawkeep-test-' + Date.now());
const TEST_FILE = path.join(TEST_DIR, 'credentials.json');
creds._setTestPaths(TEST_DIR, TEST_FILE);

function cleanup() {
  try {
    if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
    if (fs.existsSync(TEST_DIR)) fs.rmdirSync(TEST_DIR);
  } catch {}
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    cleanup();
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('\ncredentials.test.js\n');

test('loadCredentials returns null when no file', () => {
  assert.strictEqual(creds.loadCredentials(), null);
});

test('saveCredentials creates file with correct JSON structure', () => {
  creds.saveCredentials({ apiKey: 'ck_live_test123', endpoint: 'https://api.example.com' });
  assert.ok(fs.existsSync(TEST_FILE));
  const data = JSON.parse(fs.readFileSync(TEST_FILE, 'utf8'));
  assert.strictEqual(data.apiKey, 'ck_live_test123');
  assert.strictEqual(data.endpoint, 'https://api.example.com');
});

test('loadCredentials reads back saved data', () => {
  creds.saveCredentials({ apiKey: 'ck_live_abc', endpoint: 'https://test.com' });
  const loaded = creds.loadCredentials();
  assert.strictEqual(loaded.apiKey, 'ck_live_abc');
  assert.strictEqual(loaded.endpoint, 'https://test.com');
});

test('loadCredentials uses default endpoint', () => {
  creds.saveCredentials({ apiKey: 'ck_live_abc' });
  const loaded = creds.loadCredentials();
  assert.strictEqual(loaded.endpoint, 'https://api.clawkeep.com');
});

test('clearCredentials removes file', () => {
  creds.saveCredentials({ apiKey: 'ck_live_del' });
  assert.ok(fs.existsSync(TEST_FILE));
  creds.clearCredentials();
  assert.ok(!fs.existsSync(TEST_FILE));
});

test('loadCredentials handles corrupted JSON gracefully', () => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(TEST_FILE, '{broken json!!!');
  assert.strictEqual(creds.loadCredentials(), null);
});

test('loadCredentials returns null for empty apiKey', () => {
  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(TEST_FILE, JSON.stringify({ apiKey: '', endpoint: 'x' }));
  assert.strictEqual(creds.loadCredentials(), null);
});

cleanup();
console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
