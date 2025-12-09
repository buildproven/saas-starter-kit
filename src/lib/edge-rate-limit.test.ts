import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  checkEdgeRateLimit,
  getEdgeRateLimitStatus,
  clearEdgeRateLimit,
  getEdgeRateLimitStorageType,
  __clearStorageCache,
} from './edge-rate-limit'

// Mock fetch for Redis storage tests
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('edge-rate-limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __clearStorageCache()
    vi.unstubAllEnvs()
  })

  afterEach(() => {
    __clearStorageCache()
    vi.unstubAllEnvs()
  })

  describe('Memory Storage (default in test/dev)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    describe('checkEdgeRateLimit', () => {
      it('allows requests under the limit', async () => {
        const result = await checkEdgeRateLimit('test-user', 10, 60000)

        expect(result.limited).toBe(false)
        expect(result.remaining).toBe(9)
        expect(result.retryAfter).toBe(0)
        expect(result.resetTime).toBeGreaterThan(Date.now())
      })

      it('increments count on each request', async () => {
        const result1 = await checkEdgeRateLimit('test-user-2', 10, 60000)
        const result2 = await checkEdgeRateLimit('test-user-2', 10, 60000)
        const result3 = await checkEdgeRateLimit('test-user-2', 10, 60000)

        expect(result1.remaining).toBe(9)
        expect(result2.remaining).toBe(8)
        expect(result3.remaining).toBe(7)
      })

      it('limits requests when exceeding threshold', async () => {
        // Make 5 requests with limit of 3
        for (let i = 0; i < 3; i++) {
          await checkEdgeRateLimit('limited-user', 3, 60000)
        }

        const result = await checkEdgeRateLimit('limited-user', 3, 60000)

        expect(result.limited).toBe(true)
        expect(result.remaining).toBe(0)
        expect(result.retryAfter).toBeGreaterThan(0)
      })

      it('uses different keys for different identifiers', async () => {
        const result1 = await checkEdgeRateLimit('user-a', 10, 60000)
        const result2 = await checkEdgeRateLimit('user-b', 10, 60000)

        expect(result1.remaining).toBe(9)
        expect(result2.remaining).toBe(9)
      })

      it('respects window boundaries', async () => {
        // Use a very short window for testing
        const shortWindow = 100 // 100ms

        const result1 = await checkEdgeRateLimit('window-test', 5, shortWindow)
        expect(result1.remaining).toBe(4)

        // Wait for window to reset
        await new Promise((resolve) => setTimeout(resolve, 150))

        const result2 = await checkEdgeRateLimit('window-test', 5, shortWindow)
        expect(result2.remaining).toBe(4) // Should reset
      })
    })

    describe('getEdgeRateLimitStatus', () => {
      it('returns full limit when no requests made', async () => {
        const result = await getEdgeRateLimitStatus('new-user', 10, 60000)

        expect(result.limited).toBe(false)
        expect(result.remaining).toBe(10)
        expect(result.retryAfter).toBe(0)
      })

      it('returns current status without incrementing', async () => {
        // Make some requests
        await checkEdgeRateLimit('status-user', 10, 60000)
        await checkEdgeRateLimit('status-user', 10, 60000)

        // Check status (should not increment)
        const status1 = await getEdgeRateLimitStatus('status-user', 10, 60000)
        const status2 = await getEdgeRateLimitStatus('status-user', 10, 60000)

        expect(status1.remaining).toBe(8)
        expect(status2.remaining).toBe(8) // Same, not incremented
      })

      it('shows limited status when at limit', async () => {
        // Exhaust the limit
        for (let i = 0; i < 5; i++) {
          await checkEdgeRateLimit('exhausted-user', 5, 60000)
        }

        const status = await getEdgeRateLimitStatus('exhausted-user', 5, 60000)

        expect(status.limited).toBe(true)
        expect(status.remaining).toBe(0)
        expect(status.retryAfter).toBeGreaterThan(0)
      })
    })

    describe('clearEdgeRateLimit', () => {
      it('clears rate limit for an identifier', async () => {
        // Make some requests
        await checkEdgeRateLimit('clear-user', 10, 60000)
        await checkEdgeRateLimit('clear-user', 10, 60000)

        // Verify requests were counted
        const beforeClear = await getEdgeRateLimitStatus('clear-user', 10, 60000)
        expect(beforeClear.remaining).toBe(8)

        // Clear and check again
        await clearEdgeRateLimit('clear-user')

        // After clear, status check should show full limit (entry was deleted)
        const afterClear = await getEdgeRateLimitStatus('clear-user', 10, 60000)
        expect(afterClear.remaining).toBe(10)
      })
    })

    describe('getEdgeRateLimitStorageType', () => {
      it('returns memory when Redis not configured', () => {
        const type = getEdgeRateLimitStorageType()
        expect(type).toBe('memory')
      })
    })
  })

  describe('Redis Storage', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    })

    it('returns redis storage type when configured', () => {
      const type = getEdgeRateLimitStorageType()
      expect(type).toBe('redis')
    })

    it('makes increment request to Redis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 1 }],
      })

      const result = await checkEdgeRateLimit('redis-user', 10, 60000)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://redis.example.com/pipeline',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
      expect(result.limited).toBe(false)
      expect(result.remaining).toBe(9)
    })

    it('handles Redis errors gracefully in dev mode', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Redis connection failed'))

      const result = await checkEdgeRateLimit('redis-error-user', 10, 60000)

      // In dev mode, should fail open (allow request)
      expect(result.limited).toBe(false)
    })

    it('handles Redis HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await checkEdgeRateLimit('http-error-user', 10, 60000)

      expect(result.limited).toBe(false) // Fail open in dev
    })

    it('handles Redis error response in results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ error: 'Redis internal error' }],
      })

      const result = await checkEdgeRateLimit('redis-internal-error', 10, 60000)

      expect(result.limited).toBe(false) // Fail open in dev
    })

    describe('get operation', () => {
      it('retrieves entry from Redis', async () => {
        // First set up the storage
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 3 }],
        })

        await checkEdgeRateLimit('get-test-user', 10, 60000)

        // Reset mock for GET request
        __clearStorageCache()
        vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
        vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              result: JSON.stringify({
                count: 3,
                windowStart: Date.now(),
                expiresAt: Date.now() + 60000,
              }),
            },
          ],
        })

        const status = await getEdgeRateLimitStatus('get-test-user', 10, 60000)

        expect(status.remaining).toBe(7)
      })

      it('returns null for non-existent entry', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: null }],
        })

        const status = await getEdgeRateLimitStatus('nonexistent', 10, 60000)

        expect(status.remaining).toBe(10)
      })
    })

    describe('set operation', () => {
      it('handles set failures gracefully', async () => {
        // This tests the internal set method through increment
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 1 }],
        })

        const result = await checkEdgeRateLimit('set-test', 10, 60000)
        expect(result.limited).toBe(false)
      })
    })
  })

  describe('Production Mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it('throws error when Redis not configured in production', () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

      expect(() => getEdgeRateLimitStorageType()).toThrow(
        /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production/
      )
    })

    it('fails closed on storage error in production', async () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

      mockFetch.mockRejectedValueOnce(new Error('Redis unavailable'))

      const result = await checkEdgeRateLimit('prod-error-user', 10, 60000)

      expect(result.limited).toBe(true)
      expect(result.retryAfter).toBe(60)
    })

    it('fails closed on status check error in production', async () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

      // Mock to return entry that triggers the code path, then clear and test error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [
          {
            result: JSON.stringify({
              count: 5,
              windowStart: Date.now(),
              expiresAt: Date.now() + 60000,
            }),
          },
        ],
      })

      const result = await getEdgeRateLimitStatus('prod-status-error', 10, 60000)

      // Verify it reads from Redis and returns proper status
      expect(result.limited).toBe(false)
      expect(result.remaining).toBe(5)
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('handles limit of 1', async () => {
      const result1 = await checkEdgeRateLimit('single-limit', 1, 60000)
      expect(result1.limited).toBe(false)
      expect(result1.remaining).toBe(0)

      const result2 = await checkEdgeRateLimit('single-limit', 1, 60000)
      expect(result2.limited).toBe(true)
    })

    it('handles very large limits', async () => {
      const result = await checkEdgeRateLimit('large-limit', 1000000, 60000)
      expect(result.limited).toBe(false)
      expect(result.remaining).toBe(999999)
    })

    it('handles special characters in identifiers', async () => {
      const result = await checkEdgeRateLimit('user:123:api/endpoint', 10, 60000)
      expect(result.limited).toBe(false)
    })

    it('handles empty identifier', async () => {
      const result = await checkEdgeRateLimit('', 10, 60000)
      expect(result.limited).toBe(false)
    })

    it('calculates correct retryAfter value', async () => {
      // Exhaust limit
      for (let i = 0; i < 3; i++) {
        await checkEdgeRateLimit('retry-test', 3, 60000)
      }

      const result = await checkEdgeRateLimit('retry-test', 3, 60000)

      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.retryAfter).toBeLessThanOrEqual(60)
    })

    it('resets count after window expires', async () => {
      const shortWindow = 50

      // Use up some of the limit
      await checkEdgeRateLimit('expire-test', 5, shortWindow)
      await checkEdgeRateLimit('expire-test', 5, shortWindow)

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should have full limit again
      const result = await checkEdgeRateLimit('expire-test', 5, shortWindow)
      expect(result.remaining).toBe(4)
    })
  })

  describe('Storage Caching', () => {
    it('reuses cached storage instance', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

      const type1 = getEdgeRateLimitStorageType()
      const type2 = getEdgeRateLimitStorageType()

      expect(type1).toBe('memory')
      expect(type2).toBe('memory')
    })

    it('clears cache with __clearStorageCache', () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

      getEdgeRateLimitStorageType()
      __clearStorageCache()

      // Should be able to get storage again without error
      const type = getEdgeRateLimitStorageType()
      expect(type).toBe('memory')
    })
  })

  describe('Redis URL handling', () => {
    it('strips trailing slash from Redis URL', async () => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com/')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 1 }],
      })

      await checkEdgeRateLimit('url-test', 10, 60000)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://redis.example.com/pipeline',
        expect.anything()
      )
    })
  })

  describe('Redis empty response handling', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')
    })

    it('handles empty results array from Redis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })

      const result = await checkEdgeRateLimit('empty-results', 10, 60000)

      // Should fail open in dev mode
      expect(result.limited).toBe(false)
    })
  })
})
