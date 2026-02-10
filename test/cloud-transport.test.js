'use strict';

const assert = require('assert');
const { CloudTransport } = require('../src/core/transport');

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

const fakeCreds = {
  credentials: {
    endpoint: 'https://fake-r2.example.com',
    bucket: 'test-bucket',
    region: 'auto',
    access_key_id: 'AKIATEST',
    secret_access_key: 'secret123',
    prefix: 'workspaces/ws_test/',
  },
  expires_at: new Date(Date.now() + 86400000).toISOString(), // 24h from now
};

function makeTransport(overrides = {}) {
  const t = new CloudTransport({
    apiKey: 'ck_live_test',
    workspace: 'ws_test',
    endpoint: 'https://api.example.com',
  });
  // Override _fetchCredentials to avoid real HTTP
  t._fetchCredentials = async () => ({ ...fakeCreds, ...overrides });
  return t;
}

console.log('\ncloud-transport.test.js\n');

(async () => {
  await test('fetches credentials on first _ensureCredentials call', async () => {
    const t = makeTransport();
    let fetchCount = 0;
    const orig = t._fetchCredentials;
    t._fetchCredentials = async () => { fetchCount++; return orig.call(t); };
    await t._ensureCredentials();
    assert.strictEqual(fetchCount, 1);
    assert.ok(t._inner !== null, 'inner transport should be set');
  });

  await test('caches credentials on subsequent calls', async () => {
    const t = makeTransport();
    let fetchCount = 0;
    const orig = t._fetchCredentials;
    t._fetchCredentials = async () => { fetchCount++; return orig.call(t); };
    await t._ensureCredentials();
    await t._ensureCredentials();
    await t._ensureCredentials();
    assert.strictEqual(fetchCount, 1, 'should only fetch once');
  });

  await test('refreshes when within 1 hour of expiry', async () => {
    const t = makeTransport();
    let fetchCount = 0;
    const orig = t._fetchCredentials;
    t._fetchCredentials = async () => { fetchCount++; return orig.call(t); };
    await t._ensureCredentials();
    // Simulate near-expiry
    t._credsExpiry = Date.now() + 1800000; // 30 min from now (< 1 hour)
    await t._ensureCredentials();
    assert.strictEqual(fetchCount, 2, 'should refetch near expiry');
  });

  await test('throws on API error', async () => {
    const t = new CloudTransport({
      apiKey: 'ck_live_bad',
      workspace: 'ws_test',
      endpoint: 'https://api.example.com',
    });
    t._fetchCredentials = async () => { throw new Error('Cloud API error: HTTP 401'); };
    try {
      await t._ensureCredentials();
      assert.fail('should have thrown');
    } catch (err) {
      assert.ok(err.message.includes('401'));
    }
  });

  await test('delegates all 5 methods through inner transport', async () => {
    const t = makeTransport();
    const calls = [];
    // Stub _ensureCredentials to set a mock inner
    t._ensureCredentials = async () => {
      if (!t._inner) {
        t._inner = {
          writeFile: async (...a) => calls.push(['writeFile', ...a]),
          readFile: async (...a) => { calls.push(['readFile', ...a]); return Buffer.from('data'); },
          deleteFile: async (...a) => calls.push(['deleteFile', ...a]),
          listFiles: async (...a) => { calls.push(['listFiles', ...a]); return ['a.enc']; },
          exists: async (...a) => { calls.push(['exists', ...a]); return true; },
        };
      }
    };

    await t.writeFile('test.enc', Buffer.from('x'));
    await t.readFile('test.enc');
    await t.deleteFile('test.enc');
    await t.listFiles('chunks/');
    await t.exists('test.enc');

    assert.strictEqual(calls.length, 5);
    assert.deepStrictEqual(calls.map(c => c[0]),
      ['writeFile', 'readFile', 'deleteFile', 'listFiles', 'exists']);
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
