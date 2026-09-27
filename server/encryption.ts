import crypto from 'crypto';

/**
 * MailSentinel AI - Cryptographic Credential Vault
 * Backed by AES-256-GCM authenticated encryption.
 * Conforms to Step 4 security mandates:
 * - Refresh tokens NEVER stored in plaintext
 * - Refresh tokens NEVER exposed to browser
 * - Authenticated ciphertext with tamper detection
 * - Master encryption key supplied strictly via server-side environment variables
 * - Zero fallback to hardcoded keys, zero silent random key generation
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const TAG_LENGTH = 16; // Standard 128-bit auth tag for AES-GCM
const KEY_LENGTH = 32; // 256-bit AES key

let masterKeyCache: Buffer | null = null;

/**
 * Resets the cached master key (used for testing configuration states).
 */
export function clearMasterKeyCache(): void {
  masterKeyCache = null;
}

/**
 * Explicitly sets the cached master key for testing environments.
 */
export function setMasterKeyForTesting(keyHexOrString: string | null): void {
  if (keyHexOrString === null) {
    masterKeyCache = null;
    return;
  }
  const cleanKey = keyHexOrString.trim();
  if (cleanKey.length === 64 && /^[0-9a-fA-F]+$/.test(cleanKey)) {
    masterKeyCache = Buffer.from(cleanKey, 'hex');
  } else {
    masterKeyCache = crypto.createHash('sha256').update(cleanKey).digest();
  }
}

/**
 * Resolves or derives the 256-bit AES Master Encryption Key.
 * Checks:
 * 1. process.env.MASTER_TOKEN_KEY
 * 2. process.env.TOKEN_ENCRYPTION_KEY
 * 3. process.env.ENCRYPTION_SECRET
 *
 * Strictly fails if not configured.
 * Never silently generates a random key.
 * Never reads from local data files.
 * Never falls back to a hardcoded salt.
 */
export function getMasterKey(): Buffer {
  if (masterKeyCache) return masterKeyCache;

  const envKey =
    process.env.MASTER_TOKEN_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    process.env.ENCRYPTION_SECRET;

  if (!envKey || !envKey.trim()) {
    throw new Error('MASTER_TOKEN_KEY is not configured.');
  }

  const cleanKey = envKey.trim();
  if (cleanKey.length === 64 && /^[0-9a-fA-F]+$/.test(cleanKey)) {
    masterKeyCache = Buffer.from(cleanKey, 'hex');
  } else {
    masterKeyCache = crypto.createHash('sha256').update(cleanKey).digest();
  }
  return masterKeyCache;
}

/**
 * Encrypts a plaintext secret (OAuth refresh or access token) with AES-256-GCM.
 * Output format: enc:v1:<ivHex>:<tagHex>:<cipherHex>
 */
export function encryptToken(plaintext: string): string {
  if (!plaintext) return '';
  if (isEncrypted(plaintext)) return plaintext; // Prevent double encryption

  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM encrypted token.
 * Validates cryptographic authentication tag to detect any tampering or bit-flips.
 */
export function decryptToken(encryptedString: string): string {
  if (!encryptedString) return '';
  if (!isEncrypted(encryptedString)) {
    // If plaintext legacy token was passed, return it
    return encryptedString;
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted token envelope structure.');
  }

  const iv = Buffer.from(parts[2], 'hex');
  const authTag = Buffer.from(parts[3], 'hex');
  const ciphertext = Buffer.from(parts[4], 'hex');

  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

/**
 * Checks if a string is encrypted using the MailSentinel vault format.
 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith('enc:v1:') && value.split(':').length === 5;
}

/**
 * Masks a token for safe operational logging (e.g. 'ya29.***e9a1')
 * NEVER logs full tokens.
 */
export function maskToken(token: string): string {
  if (!token) return '[empty]';
  if (token.length <= 8) return '****';
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}
