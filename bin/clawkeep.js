#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const pkg = require('../package.json');

program
  .name('clawkeep')
  .description('Git-backed memory persistence for AI agents')
  .version(pkg.version);

// init — initialize clawkeep in a directory
program
  .command('init')
  .description('Initialize clawkeep tracking in the current directory')
  .option('-d, --dir <path>', 'Target directory to track', '.')
  .option('--detect', 'Auto-detect agent framework', true)
  .action((opts) => require('../src/commands/init')(opts));

// snap — commit current state
program
  .command('snap')
  .description('Snapshot current state (commit all changes)')
  .option('-m, --message <msg>', 'Custom snapshot message')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action((opts) => require('../src/commands/snap')(opts));

// diff — show what changed
program
  .command('diff')
  .description('Show changes since last snapshot')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--stat', 'Show file-level summary only', false)
  .action((opts) => require('../src/commands/diff')(opts));

// log — show history
program
  .command('log')
  .description('Show snapshot history')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-n, --limit <n>', 'Number of entries to show', '20')
  .option('--oneline', 'Compact format', false)
  .action((opts) => require('../src/commands/log')(opts));

// restore — go back to a point in time
program
  .command('restore [ref]')
  .description('Restore to a specific snapshot (by hash or relative ref)')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--hard', 'Discard current changes', false)
  .action((ref, opts) => require('../src/commands/restore')(ref, opts));

// push — sync to remote
program
  .command('push')
  .description('Push snapshots to remote repository')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-r, --remote <url>', 'Remote repository URL')
  .action((opts) => require('../src/commands/push')(opts));

// pull — pull from remote
program
  .command('pull')
  .description('Pull latest snapshots from remote')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action((opts) => require('../src/commands/pull')(opts));

// watch — auto-snap on file changes
program
  .command('watch')
  .description('Watch for file changes and auto-snapshot')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--interval <ms>', 'Debounce interval in ms', '5000')
  .option('--push', 'Auto-push after each snap', false)
  .action((opts) => require('../src/commands/watch')(opts));

// export — encrypted archive
program
  .command('export')
  .description('Export encrypted archive of all history')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-o, --output <file>', 'Output file path')
  .option('-p, --password <pass>', 'Encryption password (or set CLAWKEEP_PASSWORD)')
  .action((opts) => require('../src/commands/export')(opts));

// import — restore from encrypted archive
program
  .command('import <file>')
  .description('Import from encrypted archive')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-p, --password <pass>', 'Decryption password (or set CLAWKEEP_PASSWORD)')
  .action((file, opts) => require('../src/commands/import')(file, opts));

// status — show current state
program
  .command('status')
  .description('Show tracking status and agent info')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action((opts) => require('../src/commands/status')(opts));

program.parse();
