import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  rateLimit,
  getClientId,
  getClientIp,
  getStorageType,
  rateLimitHeaders,
  rateLimitResponse,
  RateLimiters,
  __clearStorageCache,
} from './rate-limit-unified'

// Mock fetch for Redis storage tests
const mockFetch = vi.fn()
global.fetch = mockFetch

describe('rate-limit-unified', () => {
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

    describe('rateLimit', () => {
      it('allows requests under the limit', async () => {
        const result = await rateLimit('test-key', 10, 60000)

        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(9)
        expect(result.retryAfter).toBe(0)
        expect(result.resetAt).toBeGreaterThan(Date.now())
      })

      it('increments count on each request', async () => {
        const result1 = await rateLimit('increment-key', 10, 60000)
        const result2 = await rateLimit('increment-key', 10, 60000)
        const result3 = await rateLimit('increment-key', 10, 60000)

        expect(result1.remaining).toBe(9)
        expect(result2.remaining).toBe(8)
        expect(result3.remaining).toBe(7)
      })

      it('denies requests when limit exceeded', async () => {
        // Exhaust limit
        for (let i = 0; i < 3; i++) {
          await rateLimit('limited-key', 3, 60000)
        }

        const result = await rateLimit('limited-key', 3, 60000)

        expect(result.allowed).toBe(false)
        expect(result.remaining).toBe(0)
        expect(result.retryAfter).toBeGreaterThan(0)
      })

      it('uses default limit of 60', async () => {
        const result = await rateLimit('default-limit')

        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(59)
      })

      it('uses default window of 60 seconds', async () => {
        const result = await rateLimit('default-window', 60)

        expect(result.allowed).toBe(true)
        expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 60000)
      })

      it('isolates different keys', async () => {
        const result1 = await rateLimit('key-a', 10, 60000)
        const result2 = await rateLimit('key-b', 10, 60000)

        expect(result1.remaining).toBe(9)
        expect(result2.remaining).toBe(9)
      })
    })

    describe('getStorageType', () => {
      it('returns memory when Redis not configured', () => {
        const type = getStorageType()
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
      const type = getStorageType()
      expect(type).toBe('redis')
    })

    it('makes increment request to Redis', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ result: 1 }],
      })

      const result = await rateLimit('redis-key', 10, 60000)

      expect(mockFetch).toHaveBeenCalledWith(
        'https://redis.example.com/pipeline',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      )
      expect(result.allowed).toBe(true)
    })

    it('handles Redis errors gracefully in dev mode', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Redis connection failed'))

      const result = await rateLimit('redis-error', 10, 60000)

      // In dev mode, should fail open (allow request)
      expect(result.allowed).toBe(true)
    })

    it('handles Redis HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await rateLimit('http-error', 10, 60000)

      expect(result.allowed).toBe(true) // Fail open in dev
    })

    it('handles Redis error in results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => [{ error: 'Redis internal error' }],
      })

      const result = await rateLimit('internal-error', 10, 60000)

      expect(result.allowed).toBe(true) // Fail open in dev
    })
  })

  describe('Production Mode', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
    })

    it('throws error when Redis not configured in production', () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')

      expect(() => getStorageType()).toThrow(
        /UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production/
      )
    })

    it('fails closed on storage error in production', async () => {
      vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://redis.example.com')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'test-token')

      mockFetch.mockRejectedValueOnce(new Error('Redis unavailable'))

      const result = await rateLimit('prod-error', 10, 60000)

      expect(result.allowed).toBe(false)
      expect(result.retryAfter).toBe(60)
    })
  })

  describe('Client Identification', () => {
    describe('getClientId', () => {
      it('uses CF-Connecting-IP when available', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'cf-connecting-ip': '1.2.3.4',
            'x-forwarded-for': '5.6.7.8',
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        expect(clientId).toMatch(/^1\.2\.3\.4:/)
      })

      it('falls back to X-Forwarded-For', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'x-forwarded-for': '5.6.7.8, 9.10.11.12',
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        expect(clientId).toMatch(/^5\.6\.7\.8:/)
      })

      it('falls back to X-Real-IP', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'x-real-ip': '10.11.12.13',
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        expect(clientId).toMatch(/^10\.11\.12\.13:/)
      })

      it('falls back to X-Vercel-Forwarded-For', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'x-vercel-forwarded-for': '14.15.16.17, 18.19.20.21',
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        expect(clientId).toMatch(/^14\.15\.16\.17:/)
      })

      it('returns unknown when no IP headers present', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        expect(clientId).toMatch(/^unknown:/)
      })

      it('throws error in production when HMAC secret missing', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', '')

        const request = new Request('https://example.com', {
          headers: {
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'TestAgent/1.0',
          },
        })

        expect(() => getClientId(request)).toThrow(
          /RATE_LIMIT_HMAC_SECRET is required in production/
        )
      })

      it('includes UA hash in client ID', () => {
        vi.stubEnv('NODE_ENV', 'test')
        vi.stubEnv('RATE_LIMIT_HMAC_SECRET', 'test-secret')

        const request = new Request('https://example.com', {
          headers: {
            'cf-connecting-ip': '1.2.3.4',
            'user-agent': 'TestAgent/1.0',
          },
        })

        const clientId = getClientId(request)

        // Should be IP:hash format
        expect(clientId).toMatch(/^1\.2\.3\.4:[a-f0-9]+$/)
      })
    })

    describe('getClientIp', () => {
      it('extracts IP from CF-Connecting-IP', () => {
        const request = new Request('https://example.com', {
          headers: {
            'cf-connecting-ip': '1.2.3.4',
          },
        })

        expect(getClientIp(request)).toBe('1.2.3.4')
      })

      it('extracts first IP from X-Forwarded-For', () => {
        const request = new Request('https://example.com', {
          headers: {
            'x-forwarded-for': '5.6.7.8, 9.10.11.12',
          },
        })

        expect(getClientIp(request)).toBe('5.6.7.8')
      })

      it('extracts IP from X-Real-IP', () => {
        const request = new Request('https://example.com', {
          headers: {
            'x-real-ip': '10.11.12.13',
          },
        })

        expect(getClientIp(request)).toBe('10.11.12.13')
      })

      it('extracts first IP from X-Vercel-Forwarded-For', () => {
        const request = new Request('https://example.com', {
          headers: {
            'x-vercel-forwarded-for': '14.15.16.17, 18.19.20.21',
          },
        })

        expect(getClientIp(request)).toBe('14.15.16.17')
      })

      it('returns unknown when no headers present', () => {
        const request = new Request('https://example.com')

        expect(getClientIp(request)).toBe('unknown')
      })
    })
  })

  describe('Preset Rate Limiters', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('RateLimiters.auth allows 5 requests per minute', async () => {
      const result = await RateLimiters.auth('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(4) // 5 - 1
    })

    it('RateLimiters.passwordReset allows 3 requests per hour', async () => {
      const result = await RateLimiters.passwordReset('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2) // 3 - 1
    })

    it('RateLimiters.api allows 60 requests per minute', async () => {
      const result = await RateLimiters.api('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(59) // 60 - 1
    })

    it('RateLimiters.public allows 30 requests per minute', async () => {
      const result = await RateLimiters.public('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(29) // 30 - 1
    })

    it('RateLimiters.expensive allows 10 requests per minute', async () => {
      const result = await RateLimiters.expensive('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(9) // 10 - 1
    })

    it('RateLimiters.health allows 60 requests per minute', async () => {
      const result = await RateLimiters.health('test-user')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(59) // 60 - 1
    })

    it('preset limiters use prefixed keys', async () => {
      // These should use different key prefixes and not interfere
      await RateLimiters.auth('same-user')
      await RateLimiters.api('same-user')

      const authResult = await RateLimiters.auth('same-user')
      const apiResult = await RateLimiters.api('same-user')

      expect(authResult.remaining).toBe(3) // 5 - 2
      expect(apiResult.remaining).toBe(58) // 60 - 2
    })
  })

  describe('HTTP Response Helpers', () => {
    describe('rateLimitHeaders', () => {
      it('generates correct headers for allowed request', () => {
        const result = {
          allowed: true,
          remaining: 5,
          resetAt: Date.now() + 30000,
          retryAfter: 0,
        }

        const headers = rateLimitHeaders(result)

        expect(headers['X-RateLimit-Limit']).toBe('5')
        expect(headers['X-RateLimit-Remaining']).toBe('5')
        expect(headers['X-RateLimit-Reset']).toBeDefined()
        expect(headers['Retry-After']).toBeUndefined()
      })

      it('generates correct headers for denied request', () => {
        const result = {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 30000,
          retryAfter: 30,
        }

        const headers = rateLimitHeaders(result)

        expect(headers['X-RateLimit-Limit']).toBe('1')
        expect(headers['X-RateLimit-Remaining']).toBe('0')
        expect(headers['Retry-After']).toBe('30')
      })

      it('includes ISO timestamp for reset time', () => {
        const resetAt = Date.now() + 30000
        const result = {
          allowed: true,
          remaining: 5,
          resetAt,
          retryAfter: 0,
        }

        const headers = rateLimitHeaders(result)

        expect(headers['X-RateLimit-Reset']).toBe(new Date(resetAt).toISOString())
      })
    })

    describe('rateLimitResponse', () => {
      it('returns 429 status', () => {
        const result = {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 30000,
          retryAfter: 30,
        }

        const response = rateLimitResponse(result)

        expect(response.status).toBe(429)
      })

      it('includes JSON error body', async () => {
        const result = {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 30000,
          retryAfter: 30,
        }

        const response = rateLimitResponse(result)
        const body = await response.json()

        expect(body.error).toBe('Too Many Requests')
        expect(body.message).toContain('Rate limit exceeded')
        expect(body.retryAfter).toBe(30)
      })

      it('includes rate limit headers', () => {
        const result = {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + 30000,
          retryAfter: 30,
        }

        const response = rateLimitResponse(result)

        expect(response.headers.get('Content-Type')).toBe('application/json')
        expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
        expect(response.headers.get('Retry-After')).toBe('30')
      })
    })
  })

  describe('Edge Cases', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('handles limit of 1', async () => {
      const result1 = await rateLimit('single-limit', 1, 60000)
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(0)

      const result2 = await rateLimit('single-limit', 1, 60000)
      expect(result2.allowed).toBe(false)
    })

    it('handles very short windows', async () => {
      const shortWindow = 50

      const result1 = await rateLimit('short-window', 5, shortWindow)
      expect(result1.allowed).toBe(true)

      // Wait for window to reset
      await new Promise((resolve) => setTimeout(resolve, 100))

      const result2 = await rateLimit('short-window', 5, shortWindow)
      expect(result2.remaining).toBe(4) // Should reset
    })

    it('handles special characters in keys', async () => {
      const result = await rateLimit('user:123:api/endpoint?param=value', 10, 60000)
      expect(result.allowed).toBe(true)
    })

    it('handles empty key', async () => {
      const result = await rateLimit('', 10, 60000)
      expect(result.allowed).toBe(true)
    })

    it('handles concurrent requests correctly', async () => {
      const promises = Array.from({ length: 5 }, () => rateLimit('concurrent-key', 10, 60000))

      const results = await Promise.all(promises)

      // All should be allowed
      results.forEach((r) => expect(r.allowed).toBe(true))

      // Total remaining should account for all requests
      const totalRemaining = results.reduce((sum, r) => sum + r.remaining, 0)
      // 9 + 8 + 7 + 6 + 5 = 35
      expect(totalRemaining).toBe(35)
    })
  })

  describe('Storage Cleanup', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
      vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
      vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    })

    it('__clearStorageCache resets storage', async () => {
      // Make some requests
      await rateLimit('cleanup-test', 10, 60000)
      await rateLimit('cleanup-test', 10, 60000)

      // Clear cache
      __clearStorageCache()

      // New request should start fresh (but in new storage instance)
      const result = await rateLimit('cleanup-test', 10, 60000)
      expect(result.remaining).toBe(9)
    })
  })
})
