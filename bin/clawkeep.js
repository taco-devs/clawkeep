#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const chalk = require('chalk');
const pkg = require('../package.json');

const LOGO = chalk.cyan(`
   _____ _                 _  __              
  / ____| |               | |/ /              
 | |    | | __ ___      __| ' / ___  ___ _ __ 
 | |    | |/ _\` \\ \\ /\\ / /|  < / _ \\/ _ \\ '_ \\ 
 | |____| | (_| |\\ V  V / | . \\  __/  __/ |_) |
  \\_____|_|\\__,_| \\_/\\_/  |_|\\_\\___|\\___| .__/ 
                                         | |    
                                         |_|    
`);

program
  .name('clawkeep')
  .description(
    chalk.dim('Git-backed memory persistence for AI agents') +
    '\n' +
    chalk.dim('  https://clawkeep.com')
  )
  .version(pkg.version, '-v, --version')
  .addHelpText('beforeAll', LOGO);

// init
program
  .command('init')
  .description('Initialize clawkeep tracking in the current directory')
  .option('-d, --dir <path>', 'Target directory to track', '.')
  .option('--no-detect', 'Skip auto-detection of agent framework')
  .option('--name <name>', 'Set agent name manually')
  .option('--framework <fw>', 'Set framework manually (openclaw|clawdbot|nanobot|generic)')
  .action((opts) => require('../src/commands/init')(opts));

// snap
program
  .command('snap')
  .description('Snapshot current state (commit all changes)')
  .option('-m, --message <msg>', 'Custom snapshot message')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-q, --quiet', 'Minimal output', false)
  .action((opts) => require('../src/commands/snap')(opts));

// diff
program
  .command('diff')
  .description('Show changes since last snapshot')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--stat', 'Show file-level summary only', false)
  .action((opts) => require('../src/commands/diff')(opts));

// log
program
  .command('log')
  .description('Show snapshot history timeline')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-n, --limit <n>', 'Number of entries', '20')
  .option('--oneline', 'Compact single-line format', false)
  .option('--json', 'Output as JSON', false)
  .action((opts) => require('../src/commands/log')(opts));

// restore
program
  .command('restore [ref]')
  .description('Restore to a specific snapshot (by hash, HEAD~N, or interactive)')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--hard', 'Discard current changes (destructive)', false)
  .action((ref, opts) => require('../src/commands/restore')(ref, opts));

// push
program
  .command('push')
  .description('Push snapshots to remote repository')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-r, --remote <url>', 'Set remote repository URL')
  .action((opts) => require('../src/commands/push')(opts));

// pull
program
  .command('pull')
  .description('Pull latest snapshots from remote')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action((opts) => require('../src/commands/pull')(opts));

// watch
program
  .command('watch')
  .description('Watch for file changes and auto-snapshot')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--interval <ms>', 'Debounce interval in ms', '5000')
  .option('--push', 'Auto-push after each snap', false)
  .option('-q, --quiet', 'Minimal output', false)
  .action((opts) => require('../src/commands/watch')(opts));

// export
program
  .command('export')
  .description('Export encrypted archive of full history')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('-o, --output <file>', 'Output file path')
  .option('-p, --password <pass>', 'Encryption password (or CLAWKEEP_PASSWORD env)')
  .action((opts) => require('../src/commands/export')(opts));

// import
program
  .command('import <file>')
  .description('Import and restore from encrypted archive')
  .option('-d, --dir <path>', 'Restore destination', '.')
  .option('-p, --password <pass>', 'Decryption password (or CLAWKEEP_PASSWORD env)')
  .action((file, opts) => require('../src/commands/import')(file, opts));

// ui
program
  .command('ui')
  .description('Launch the web dashboard')
  .option('-d, --dir <path>', 'Target directory', '.')
  .option('--port <port>', 'Port number', '3333')
  .action((opts) => require('../src/commands/ui')(opts));

// status
program
  .command('status')
  .description('Show tracking status, agent info, and stats')
  .option('-d, --dir <path>', 'Target directory', '.')
  .action((opts) => require('../src/commands/status')(opts));

program.parse();
