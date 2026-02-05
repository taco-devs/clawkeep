'use strict';

const crypto = require('crypto');

const MAGIC = Buffer.from('CK01');
const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH + NONCE_LENGTH; // 4 + 32 + 12 = 48

/**
 * Derive encryption key from password using scrypt.
 */
function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypt a buffer using AES-256-GCM.
 * Output format: [4B magic "CK01"][32B salt][12B nonce][NB ciphertext][16B auth tag]
 */
function encryptChunk(buffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC, salt, nonce, encrypted, tag]);
}

/**
 * Decrypt a CK01-format encrypted buffer.
 * Returns the decrypted plaintext buffer.
 */
function decryptChunk(encBuffer, password) {
  if (encBuffer.length < HEADER_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid chunk: too small');
  }

  const magic = encBuffer.subarray(0, 4);
  if (!magic.equals(MAGIC)) {
    throw new Error('Invalid chunk: bad magic (expected CK01)');
  }

  const salt = encBuffer.subarray(4, 4 + SALT_LENGTH);
  const nonce = encBuffer.subarray(4 + SALT_LENGTH, HEADER_LENGTH);
  const ciphertext = encBuffer.subarray(HEADER_LENGTH, encBuffer.length - TAG_LENGTH);
  const tag = encBuffer.subarray(encBuffer.length - TAG_LENGTH);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    throw new Error('Decryption failed — wrong password or corrupted chunk');
  }
}

/**
 * Hash a password for storage (verification only, not the password itself).
 * Format: $scrypt$<salt-hex>$<hash-hex>
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return '$scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

/**
 * Verify a password against a stored hash.
 */
function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith('$scrypt$')) return false;
  const parts = storedHash.split('$');
  // parts: ['', 'scrypt', '<salt>', '<hash>']
  if (parts.length !== 4) return false;
  const salt = Buffer.from(parts[2], 'hex');
  const expected = Buffer.from(parts[3], 'hex');
  const derived = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return crypto.timingEqual(derived, expected);
}

module.exports = { encryptChunk, decryptChunk, hashPassword, verifyPassword };
