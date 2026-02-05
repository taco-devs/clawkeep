'use strict';

const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { createGzip, createGunzip } = require('zlib');
const tar = require('tar');
const path = require('path');

const ALGORITHM = 'aes-256-ctr';
const SALT_LENGTH = 16;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive encryption key from password using scrypt.
 */
function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH);
}

/**
 * Export a directory (including .git) to an encrypted archive.
 * Format: [salt:16][iv:16][encrypted tar.gz data]
 */
async function exportEncrypted(dir, outputPath, password) {
  dir = path.resolve(dir);
  
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const output = fs.createWriteStream(outputPath);

  // Write salt and IV as header
  output.write(salt);
  output.write(iv);

  // Create tar.gz stream of the entire directory (including .git)
  const tarStream = tar.create(
    {
      gzip: true,
      cwd: path.dirname(dir),
      filter: (entryPath) => {
        // Skip node_modules to keep archives sane
        return !entryPath.includes('node_modules');
      },
    },
    [path.basename(dir)]
  );

  // Pipe: tar.gz -> encrypt -> file
  await pipeline(tarStream, cipher, output);

  const stats = fs.statSync(outputPath);
  return {
    path: outputPath,
    size: stats.size,
    salt: salt.toString('hex'),
  };
}

/**
 * Import from an encrypted archive.
 * Decrypts and extracts to the target directory.
 */
async function importEncrypted(archivePath, targetDir, password) {
  targetDir = path.resolve(targetDir);
  
  const input = fs.openSync(archivePath, 'r');
  
  // Read salt and IV from header
  const salt = Buffer.alloc(SALT_LENGTH);
  const iv = Buffer.alloc(IV_LENGTH);
  fs.readSync(input, salt, 0, SALT_LENGTH, 0);
  fs.readSync(input, iv, 0, IV_LENGTH, SALT_LENGTH);
  fs.closeSync(input);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  // Create a readable stream starting after the header
  const encryptedStream = fs.createReadStream(archivePath, {
    start: SALT_LENGTH + IV_LENGTH,
  });

  // Ensure target dir exists
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Pipe: file -> decrypt -> untar
  const extractStream = tar.extract({
    cwd: targetDir,
    strip: 1, // Remove the top-level directory
  });

  await pipeline(encryptedStream, decipher, createGunzip(), extractStream);

  return { path: targetDir };
}

module.exports = { exportEncrypted, importEncrypted };
