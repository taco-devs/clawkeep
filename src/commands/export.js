'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const ClawGit = require('../core/git');
const { exportEncrypted } = require('../core/crypto');

module.exports = async function exportCmd(opts) {
  const dir = path.resolve(opts.dir || '.');
  const spinner = ora('Exporting encrypted archive...').start();

  try {
    const claw = new ClawGit(dir);

    if (!(await claw.isInitialized())) {
      spinner.fail('ClawKeep not initialized. Run `clawkeep init` first.');
      process.exit(1);
    }

    // Get password
    const password = opts.password || process.env.CLAWKEEP_PASSWORD;
    if (!password) {
      spinner.fail('Password required. Use -p <password> or set CLAWKEEP_PASSWORD');
      process.exit(1);
    }

    // Default output path
    const config = claw.loadConfig();
    const agentName = config.agentName || 'agent';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const outputPath = opts.output || path.join(process.cwd(), `${agentName}-${timestamp}.clawkeep.enc`);

    // Take a snap first to capture latest state
    spinner.text = 'Capturing latest state...';
    await claw.snap('export: pre-export snapshot');

    // Export
    spinner.text = 'Encrypting archive...';
    const result = await exportEncrypted(dir, outputPath, password);

    const sizeMB = (result.size / 1024 / 1024).toFixed(2);
    spinner.succeed('Encrypted archive exported!');
    console.log('');
    console.log(`  📦 ${chalk.cyan(result.path)}`);
    console.log(`  Size: ${chalk.yellow(sizeMB + ' MB')}`);
    console.log(`  Encryption: ${chalk.green('AES-256-CTR + scrypt')}`);
    console.log('');
    console.log(chalk.yellow('  ⚠️  Don\'t lose the password. We can\'t recover it.'));
  } catch (err) {
    spinner.fail('Export failed');
    console.error(chalk.red(err.message));
    process.exit(1);
  }
};
