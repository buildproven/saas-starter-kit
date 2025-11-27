import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto'
import { promisify } from 'util'

/**
 * Token Encryption Utility
 *
 * Encrypts sensitive tokens (OAuth access/refresh, API keys) before storing in database.
 * Uses AES-256-GCM for authenticated encryption with key derivation.
 *
 * Setup:
 * 1. Generate key: openssl rand -hex 32
 * 2. Add to .env: ENCRYPTION_KEY=your_generated_key
 */

const scryptAsync = promisify(scrypt)

// Encryption configuration
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // AES block size
const SALT_LENGTH = 32
const TAG_LENGTH = 16
const KEY_LENGTH = 32

/**
 * Validate encryption key is properly configured
 */
function validateEncryptionKey(): string {
  const encryptionKey = process.env.ENCRYPTION_KEY

  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY environment variable is required for token encryption. Generate with: openssl rand -hex 32'
    )
  }

  if (encryptionKey.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters). Generate with: openssl rand -hex 32'
    )
  }

  return encryptionKey
}

/**
 * Derive encryption key from master key and salt
 */
async function deriveKey(masterKey: string, salt: Buffer): Promise<Buffer> {
  const keyBuffer = Buffer.from(masterKey, 'hex')
  return (await scryptAsync(keyBuffer, salt, KEY_LENGTH)) as Buffer
}

/**
 * Encrypt a token string
 *
 * @param token - The plain text token to encrypt
 * @returns Base64-encoded encrypted string containing salt + iv + tag + ciphertext
 *
 * @example
 * ```typescript
 * const encrypted = await encryptToken(oauthAccessToken)
 * // Store encrypted in database
 * ```
 */
export async function encryptToken(token: string): Promise<string> {
  if (!token) {
    return token
  }

  try {
    const masterKey = validateEncryptionKey()

    // Generate random salt and IV
    const salt = randomBytes(SALT_LENGTH)
    const iv = randomBytes(IV_LENGTH)

    // Derive encryption key
    const key = await deriveKey(masterKey, salt)

    // Create cipher
    const cipher = createCipheriv(ALGORITHM, key, iv)

    // Encrypt the token
    let encrypted = cipher.update(token, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Get authentication tag
    const tag = cipher.getAuthTag()

    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([salt, iv, tag, Buffer.from(encrypted, 'hex')])

    return combined.toString('base64')
  } catch (error) {
    console.error('Token encryption failed:', error)
    throw new Error('Failed to encrypt token')
  }
}

/**
 * Decrypt a token string
 *
 * @param encryptedToken - The Base64-encoded encrypted token
 * @returns The decrypted plain text token
 *
 * @example
 * ```typescript
 * const decrypted = await decryptToken(storedEncryptedToken)
 * // Use decrypted token for API calls
 * ```
 */
export async function decryptToken(encryptedToken: string): Promise<string> {
  if (!encryptedToken) {
    return encryptedToken
  }

  try {
    const masterKey = validateEncryptionKey()

    // Parse the combined data
    const combined = Buffer.from(encryptedToken, 'base64')

    const salt = combined.subarray(0, SALT_LENGTH)
    const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
    const tag = combined.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH)
    const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH)

    // Derive the same encryption key
    const key = await deriveKey(masterKey, salt)

    // Create decipher
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    // Decrypt
    let decrypted = decipher.update(encrypted, undefined, 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error) {
    console.error('Token decryption failed:', error)
    throw new Error('Failed to decrypt token - token may be corrupted or key changed')
  }
}

/**
 * Check if a string appears to be an encrypted token
 */
export function isEncryptedToken(value: string): boolean {
  if (!value) return false

  try {
    const buffer = Buffer.from(value, 'base64')
    // Check if it's long enough to contain salt + iv + tag + at least 1 byte of encrypted data
    // Minimum: 32 (salt) + 16 (iv) + 16 (tag) + 1 (data) = 65 bytes
    return buffer.length >= SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1
  } catch {
    return false
  }
}

/**
 * Generate a new encryption key (for setup)
 *
 * @example
 * ```typescript
 * const key = generateEncryptionKey()
 * console.log('Add to .env: ENCRYPTION_KEY=' + key)
 * ```
 */
export function generateEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Rotate encryption key (decrypt with old key, encrypt with new key)
 *
 * @param encryptedToken - Token encrypted with old key
 * @param oldKey - Previous encryption key
 * @param newKey - New encryption key
 * @returns Token re-encrypted with new key
 */
export async function rotateTokenEncryption(
  encryptedToken: string,
  oldKey: string,
  newKey: string
): Promise<string> {
  if (!encryptedToken) {
    return encryptedToken
  }

  // Temporarily set old key
  const originalKey = process.env.ENCRYPTION_KEY
  process.env.ENCRYPTION_KEY = oldKey

  try {
    // Decrypt with old key
    const decrypted = await decryptToken(encryptedToken)

    // Set new key
    process.env.ENCRYPTION_KEY = newKey

    // Encrypt with new key
    const reencrypted = await encryptToken(decrypted)

    return reencrypted
  } finally {
    // Restore original key
    process.env.ENCRYPTION_KEY = originalKey
  }
}
