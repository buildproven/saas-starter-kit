import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { rateLimit, type RateLimitResponse } from './rate-limit-facade'
import { __clearStorageCache } from './edge-rate-limit'

// Mock fetch for Redis storage tests
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('rate-limit-facade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearStorageCache()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    __clearStorageCache()
    vi.unstubAllEnvs()
  })

  describe('rateLimit facade function', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('returns RateLimitResponse with correct structure', async () => {
      const result = await rateLimit('test-key', 10, 60000)

      expect(result).toHaveProperty('allowed')
      expect(result).toHaveProperty('remaining')
      expect(result).toHaveProperty('resetAt')
      expect(result).toHaveProperty('retryAfter')
    })

    it('maps limited=true to allowed=false', async () => {
      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await rateLimit('exhaust-key', 3, 60000)
      }

      const result = await rateLimit('exhaust-key', 3, 60000)

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('maps limited=false to allowed=true', async () => {
      const result = await rateLimit('allowed-key', 10, 60000)

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9)
    })

    it('maps resetTime to resetAt', async () => {
      const result = await rateLimit('reset-key', 10, 60000)

      expect(result.resetAt).toBeGreaterThan(Date.now())
      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60000)
    })

    it('passes retryAfter through correctly', async () => {
      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await rateLimit('retry-key', 3, 60000)
      }

      const result = await rateLimit('retry-key', 3, 60000)

      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(60)
    })

    it('uses default limit of 60', async () => {
      const result = await rateLimit('default-limit-key')

      expect(result.remaining).toBe(59) // 60 - 1
    })

    it('uses default window of 60 seconds', async () => {
      const result = await rateLimit('default-window-key', 60)

      expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60000)
    })

    it('increments correctly across calls', async () => {
      const result1 = await rateLimit('increment-key', 10, 60000)
      const result2 = await rateLimit('increment-key', 10, 60000)
      const result3 = await rateLimit('increment-key', 10, 60000)

      expect(result1.remaining).toBe(9)
      expect(result2.remaining).toBe(8)
      expect(result3.remaining).toBe(7)
    })

    it('isolates different keys', async () => {
      const result1 = await rateLimit('key-a', 10, 60000)
      const result2 = await rateLimit('key-b', 10, 60000)

      expect(result1.remaining).toBe(9)
      expect(result2.remaining).toBe(9)
    })
  })

  describe('type definitions', () => {
    it('RateLimitResponse type has correct shape', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

      const result: RateLimitResponse = await rateLimit('type-test', 10, 60000)

      // TypeScript compilation proves these exist
      const _allowed: boolean = result.allowed
      const _remaining: number = result.remaining
      const _resetAt: number = result.resetAt
      const _retryAfter: number = result.retryAfter

      expect(_allowed).toBe(true)
      expect(typeof _remaining).toBe('number')
      expect(typeof _resetAt).toBe('number')
      expect(typeof _retryAfter).toBe('number')
    })
  })

  describe('edge cases', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('handles limit of 1', async () => {
      const result1 = await rateLimit('single', 1, 60000)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(0)

      const result2 = await rateLimit('single', 1, 60000)
      expect(result2.allowed).toBe(false)
    })

    it('handles empty key', async () => {
      const result = await rateLimit('', 10, 60000)
      expect(result.allowed).toBe(true)
    })

    it('handles special characters in key', async () => {
      const result = await rateLimit('user:123/api?param=value', 10, 60000)
      expect(result.allowed).toBe(true)
    })

    it('handles very small window', async () => {
      const result = await rateLimit('small-window', 5, 50)

      expect(result.allowed).toBe(true)

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result2 = await rateLimit('small-window', 5, 50)
      expect(result2.remaining).toBe(4) // Reset
    })
  })

  describe('integration with edge-rate-limit', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    })

    it('uses Redis when configured', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 1 }],
      })

      const result = await rateLimit('redis-facade-key', 10, 60000)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://redis.example.com/pipeline',
        expect.anything()
      )
      expect(result.allowed).toBe(true)
    })

    it('handles Redis errors gracefully in dev', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Redis error'))

      const result = await rateLimit('error-key', 10, 60000)

      // Fail open in dev
      expect(result.allowed).toBe(true)
    })
  })

  describe('production mode', () => {
    it('fails closed on error in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

      mockFetch.mockRejectedValueOnce(new Error('Redis unavailable'))

      const result = await rateLimit('prod-error', 10, 60000)

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBe(60)
    })
  })
})
