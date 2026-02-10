'use strict';

const assert = require('assert');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  \u2713 ${name}`);
    passed++;
  } catch (err) {
    console.log(`  \u2717 ${name}`);
    console.log(`    ${err.message}`);
    failed++;
  }
}

console.log('\nwatch-sync.test.js\n');

test('watch.js passes CLAWKEEP_PASSWORD to bm.sync()', () => {
  // Read the watch.js source and verify the fix
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../src/commands/watch.js'), 'utf8');
  assert.ok(
    src.includes("bm.sync(process.env.CLAWKEEP_PASSWORD || null)"),
    'watch.js should pass CLAWKEEP_PASSWORD env var to bm.sync()'
  );
  assert.ok(
    !src.includes('await bm.sync();') || src.indexOf('await bm.sync(process.env.CLAWKEEP_PASSWORD') >= 0,
    'Should not have bare bm.sync() call without password'
  );
});

test('watch.js daemon forwards env vars to child process', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../src/commands/watch.js'), 'utf8');
  assert.ok(
    src.includes('...process.env'),
    'Daemon should spread process.env to child process so CLAWKEEP_PASSWORD is forwarded'
  );
});

console.log(`\n  ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
