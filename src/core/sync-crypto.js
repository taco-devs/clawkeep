'use strict';

const crypto = require('crypto');

const MAGIC_CK01 = Buffer.from('CK01');
const MAGIC_CK02 = Buffer.from('CK02');
const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const KEY_LENGTH = 32;
const TAG_LENGTH = 16;
const ALGORITHM = 'aes-256-gcm';
const CK01_HEADER_LENGTH = MAGIC_CK01.length + SALT_LENGTH + NONCE_LENGTH; // 4 + 32 + 12 = 48
const CK02_HEADER_LENGTH = MAGIC_CK02.length + NONCE_LENGTH; // 4 + 12 = 16

/**
 * Derive encryption key from password using scrypt.
 */
function deriveKey(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
}

/**
 * Encrypt a buffer using AES-256-GCM (CK01 format — password-based).
 * Output format: [4B "CK01"][32B salt][12B nonce][NB ciphertext][16B auth tag]
 */
function encryptChunk(buffer, password) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([MAGIC_CK01, salt, nonce, encrypted, tag]);
}

/**
 * Encrypt a buffer using AES-256-GCM with a pre-derived key (CK02 format).
 * Output format: [4B "CK02"][12B nonce][NB ciphertext][16B auth tag]
 * Much faster than CK01 — no per-chunk scrypt.
 */
function encryptChunkWithKey(buffer, key) {
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, nonce);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([MAGIC_CK02, nonce, encrypted, tag]);
}

/**
 * Decrypt an encrypted buffer. Auto-detects CK01 vs CK02 format.
 * @param {Buffer} encBuffer - Encrypted chunk
 * @param {string|null} password - Password for CK01 chunks (null OK if CK02 + key)
 * @param {Buffer|null} key - Pre-derived key for CK02 chunks (null OK if CK01 + password)
 */
function decryptChunk(encBuffer, password, key) {
  if (encBuffer.length < CK02_HEADER_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid chunk: too small');
  }

  const magic = encBuffer.subarray(0, 4);

  if (magic.equals(MAGIC_CK02)) {
    if (!key) throw new Error('CK02 chunk requires an encryption key (not a password)');
    return decryptChunkWithKey(encBuffer, key);
  }

  if (magic.equals(MAGIC_CK01)) {
    if (!password) throw new Error('CK01 chunk requires a password');
    if (encBuffer.length < CK01_HEADER_LENGTH + TAG_LENGTH) {
      throw new Error('Invalid CK01 chunk: too small');
    }
    const salt = encBuffer.subarray(4, 4 + SALT_LENGTH);
    const nonce = encBuffer.subarray(4 + SALT_LENGTH, CK01_HEADER_LENGTH);
    const ciphertext = encBuffer.subarray(CK01_HEADER_LENGTH, encBuffer.length - TAG_LENGTH);
    const tag = encBuffer.subarray(encBuffer.length - TAG_LENGTH);

    const derivedKey = deriveKey(password, salt);
    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, nonce);
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch (e) {
      throw new Error('Decryption failed — wrong password or corrupted chunk');
    }
  }

  throw new Error('Invalid chunk: unknown magic bytes');
}

/**
 * Decrypt a CK02-format buffer with a pre-derived key.
 */
function decryptChunkWithKey(encBuffer, key) {
  const nonce = encBuffer.subarray(4, 4 + NONCE_LENGTH);
  const tag = encBuffer.subarray(encBuffer.length - TAG_LENGTH);
  const ciphertext = encBuffer.subarray(CK02_HEADER_LENGTH, encBuffer.length - TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (e) {
    throw new Error('Decryption failed — wrong key or corrupted chunk');
  }
}

/**
 * Derive a deterministic encryption key from a password using HKDF-SHA256.
 * This key is stored wrapped in config, so the daemon doesn't need the password.
 */
function deriveEncryptionKey(password) {
  // HKDF extract: PRK = HMAC-SHA256(salt, IKM)
  const prk = crypto.createHmac('sha256', 'clawkeep').update(password).digest();
  // HKDF expand: OKM = HMAC-SHA256(PRK, info || 0x01)
  const info = Buffer.from('clawkeep-encryption');
  const t = crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest();
  return t.subarray(0, 32);
}

/**
 * Wrap an encryption key using AES-256-GCM with the password hash as wrapping key.
 * @param {Buffer} encryptionKey - The key to wrap
 * @param {string} passwordHash - "$scrypt$<salt-hex>$<hash-hex>" format
 * @returns {string} Base64-encoded wrapped key: [12B nonce][encrypted][16B tag]
 */
function wrapKey(encryptionKey, passwordHash) {
  const hashBytes = Buffer.from(passwordHash.split('$')[3], 'hex');
  const nonce = crypto.randomBytes(NONCE_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, hashBytes, nonce);
  const enc = Buffer.concat([cipher.update(encryptionKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, enc, tag]).toString('base64');
}

/**
 * Unwrap an encryption key using AES-256-GCM with the password hash.
 * @param {string} wrappedKeyB64 - Base64-encoded wrapped key
 * @param {string} passwordHash - "$scrypt$<salt-hex>$<hash-hex>" format
 * @returns {Buffer} The unwrapped 32-byte encryption key
 */
function unwrapKey(wrappedKeyB64, passwordHash) {
  const hashBytes = Buffer.from(passwordHash.split('$')[3], 'hex');
  const buf = Buffer.from(wrappedKeyB64, 'base64');
  const nonce = buf.subarray(0, NONCE_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const enc = buf.subarray(NONCE_LENGTH, buf.length - TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, hashBytes, nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]);
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

module.exports = {
  encryptChunk,
  encryptChunkWithKey,
  decryptChunk,
  decryptChunkWithKey,
  deriveEncryptionKey,
  wrapKey,
  unwrapKey,
  hashPassword,
  verifyPassword,
};
