import {
  encryptToken,
  decryptToken,
  isEncryptedToken,
  generateEncryptionKey,
  rotateTokenEncryption,
} from './encryption'

describe('encryption', () => {
  const TEST_KEY = 'a'.repeat(64) // Valid 32-byte hex key

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY
  })

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY
  })

  describe('encryptToken', () => {
    it('encrypts a token successfully', async () => {
      const token = 'my-secret-token-12345'
      const encrypted = await encryptToken(token)

      expect(encrypted).toBeDefined()
      expect(encrypted).not.toBe(token)
      expect(typeof encrypted).toBe('string')
    })

    it('returns empty string for empty input', async () => {
      const result = await encryptToken('')
      expect(result).toBe('')
    })

    it('produces different ciphertext for same plaintext (due to random salt/IV)', async () => {
      const token = 'same-token'
      const encrypted1 = await encryptToken(token)
      const encrypted2 = await encryptToken(token)

      expect(encrypted1).not.toBe(encrypted2)
    })

    it('throws error when ENCRYPTION_KEY is missing', async () => {
      delete process.env.ENCRYPTION_KEY

      await expect(encryptToken('token')).rejects.toThrow('Failed to encrypt token')
    })

    it('throws error when ENCRYPTION_KEY is wrong length', async () => {
      process.env.ENCRYPTION_KEY = 'short-key'

      await expect(encryptToken('token')).rejects.toThrow('Failed to encrypt token')
    })
  })

  describe('decryptToken', () => {
    it('decrypts an encrypted token successfully', async () => {
      const originalToken = 'my-secret-token-12345'
      const encrypted = await encryptToken(originalToken)
      const decrypted = await decryptToken(encrypted)

      expect(decrypted).toBe(originalToken)
    })

    it('returns empty string for empty input', async () => {
      const result = await decryptToken('')
      expect(result).toBe('')
    })

    it('handles special characters in token', async () => {
      const token = 'token/with+special=chars&more!'
      const encrypted = await encryptToken(token)
      const decrypted = await decryptToken(encrypted)

      expect(decrypted).toBe(token)
    })

    it('handles unicode characters', async () => {
      const token = 'token-with-émojis-🔐'
      const encrypted = await encryptToken(token)
      const decrypted = await decryptToken(encrypted)

      expect(decrypted).toBe(token)
    })

    it('throws error for corrupted ciphertext', async () => {
      const corrupted = Buffer.from('invalid-data').toString('base64')

      await expect(decryptToken(corrupted)).rejects.toThrow()
    })

    it('throws error when decrypting with wrong key', async () => {
      const encrypted = await encryptToken('secret')

      // Change the key
      process.env.ENCRYPTION_KEY = 'b'.repeat(64)

      await expect(decryptToken(encrypted)).rejects.toThrow()
    })
  })

  describe('isEncryptedToken', () => {
    it('returns true for encrypted tokens', async () => {
      const encrypted = await encryptToken('test')
      expect(isEncryptedToken(encrypted)).toBe(true)
    })

    it('returns false for plain text', () => {
      expect(isEncryptedToken('plain-text-token')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isEncryptedToken('')).toBe(false)
    })

    it('returns false for short base64 strings', () => {
      expect(isEncryptedToken(Buffer.from('short').toString('base64'))).toBe(false)
    })
  })

  describe('generateEncryptionKey', () => {
    it('generates a 64-character hex string', () => {
      const key = generateEncryptionKey()

      expect(key).toHaveLength(64)
      expect(/^[0-9a-f]+$/.test(key)).toBe(true)
    })

    it('generates unique keys each time', () => {
      const key1 = generateEncryptionKey()
      const key2 = generateEncryptionKey()

      expect(key1).not.toBe(key2)
    })
  })

  describe('rotateTokenEncryption', () => {
    it('re-encrypts token with new key', async () => {
      const oldKey = 'a'.repeat(64)
      const newKey = 'b'.repeat(64)
      const originalToken = 'my-secret'

      // Encrypt with old key
      process.env.ENCRYPTION_KEY = oldKey
      const encryptedOld = await encryptToken(originalToken)

      // Rotate to new key
      const encryptedNew = await rotateTokenEncryption(encryptedOld, oldKey, newKey)

      // Verify can decrypt with new key
      process.env.ENCRYPTION_KEY = newKey
      const decrypted = await decryptToken(encryptedNew)

      expect(decrypted).toBe(originalToken)
    })

    it('returns empty string for empty input', async () => {
      const result = await rotateTokenEncryption('', 'a'.repeat(64), 'b'.repeat(64))
      expect(result).toBe('')
    })
  })
})
