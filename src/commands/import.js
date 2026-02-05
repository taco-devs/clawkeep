'use strict';

const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const { importEncrypted } = require('../core/crypto');

module.exports = async function importCmd(file, opts) {
  const targetDir = path.resolve(opts.dir || '.');
  const spinner = ora('Importing from encrypted archive...').start();

  try {
    const archivePath = path.resolve(file);

    // Get password
    const password = opts.password || process.env.CLAWKEEP_PASSWORD;
    if (!password) {
      spinner.fail('Password required. Use -p <password> or set CLAWKEEP_PASSWORD');
      process.exit(1);
    }

    spinner.text = 'Decrypting and extracting...';
    const result = await importEncrypted(archivePath, targetDir, password);

    spinner.succeed('Import complete!');
    console.log('');
    console.log(`  📂 Restored to: ${chalk.cyan(result.path)}`);
    console.log(chalk.dim('  Your full history and memory are restored.'));
    console.log(chalk.dim('  Run `clawkeep log` to see snapshot history.'));
  } catch (err) {
    spinner.fail('Import failed');
    if (err.message.includes('incorrect header check') || err.message.includes('bad decrypt')) {
      console.error(chalk.red('  Wrong password or corrupted archive.'));
    } else {
      console.error(chalk.red(err.message));
    }
    process.exit(1);
  }
};
