'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');

const creds = require('../src/core/credentials');

// Use temp dir for credentials
const TEST_CREDS_DIR = path.join(os.tmpdir(), '.clawkeep-cmd-test-' + Date.now());
const TEST_CREDS_FILE = path.join(TEST_CREDS_DIR, 'credentials.json');
creds._setTestPaths(TEST_CREDS_DIR, TEST_CREDS_FILE);

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn().then(() => {
    console.log(`  \u2713 ${name}`);
    passed++;
  }).catch((err) => {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  });
}

function cleanup() {
  try {
    if (fs.existsSync(TEST_CREDS_FILE)) fs.unlinkSync(TEST_CREDS_FILE);
    if (fs.existsSync(TEST_CREDS_DIR)) fs.rmdirSync(TEST_CREDS_DIR);
  } catch {}
}

console.log('\ncloud-command.test.js\n');

(async () => {
  // Test: headless setup saves credentials
  await test('headless setup saves credentials', async () => {
    cleanup();
    creds.saveCredentials({ apiKey: 'ck_live_headless', endpoint: 'https://test.clawkeep.com' });
    const loaded = creds.loadCredentials();
    assert.strictEqual(loaded.apiKey, 'ck_live_headless');
    assert.strictEqual(loaded.endpoint, 'https://test.clawkeep.com');
    cleanup();
  });

  // Test: browser callback server validates state
  await test('browser callback server validates state and returns params', async () => {
    cleanup();
    const state = crypto.randomBytes(24).toString('hex');

    const { promise, port } = await new Promise((resolve) => {
      let resolveResult;
      const resultPromise = new Promise((res) => { resolveResult = res; });

      const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
        const reqState = url.searchParams.get('state');
        const apiKey = url.searchParams.get('api_key');
        const workspace = url.searchParams.get('workspace');
        if (reqState !== state) { res.writeHead(400); res.end('bad state'); return; }
        res.writeHead(200); res.end('ok');
        server.close();
        resolveResult({ apiKey, workspace });
      });

      server.listen(0, '127.0.0.1', () => {
        resolve({ promise: resultPromise, port: server.address().port });
      });
    });

    // Simulate browser callback
    await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/callback?api_key=ck_live_browser&workspace=ws_browser&state=${state}`, (res) => {
        assert.strictEqual(res.statusCode, 200);
        resolve();
      });
      req.on('error', reject);
      req.end();
    });

    const result = await promise;
    assert.strictEqual(result.apiKey, 'ck_live_browser');
    assert.strictEqual(result.workspace, 'ws_browser');
    cleanup();
  });

  // Test: browser callback rejects bad state
  await test('browser callback rejects bad state', async () => {
    cleanup();
    const state = 'good-state';

    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const reqState = url.searchParams.get('state');
      if (reqState !== state) { res.writeHead(400); res.end('bad state'); return; }
      res.writeHead(200); res.end('ok');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const res = await new Promise((resolve, reject) => {
      const req = http.request(`http://127.0.0.1:${port}/callback?api_key=x&workspace=y&state=wrong-state`, (r) => {
        resolve(r);
      });
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(res.statusCode, 400);
    server.close();
    cleanup();
  });

  // Test: cloud status shows "not connected" when no creds
  await test('cloud status shows not connected when no creds', async () => {
    cleanup();
    const loaded = creds.loadCredentials();
    assert.strictEqual(loaded, null);
    cleanup();
  });

  // Test: cloud logout clears credentials
  await test('cloud logout clears credentials', async () => {
    creds.saveCredentials({ apiKey: 'ck_live_to_delete' });
    assert.ok(creds.loadCredentials() !== null);
    creds.clearCredentials();
    assert.strictEqual(creds.loadCredentials(), null);
    cleanup();
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
