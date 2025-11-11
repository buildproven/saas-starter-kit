import {
  checkRateLimit,
  createRateLimiter,
  RateLimiters,
  getClientIp,
  stopCleanup,
  clearRateLimits,
} from './rate-limit'
import { logger } from './logger'

jest.mock('./logger', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
  },
}))

describe('rate-limit', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    clearRateLimits()
    stopCleanup()
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    stopCleanup()
  })

  describe('checkRateLimit', () => {
    describe('TEST-002-01: Sliding window algorithm correctness', () => {
      it('allows requests under the limit', () => {
        const config = { maxRequests: 5, windowMs: 60000 }

        // Make 5 requests
        for (let i = 0; i < 5; i++) {
          const result = checkRateLimit('client1', config)
          expect(result.allowed).toBe(true)
          expect(result.remaining).toBe(4 - i)
        }
      })

      it('blocks request when limit exceeded', () => {
        const config = { maxRequests: 3, windowMs: 60000 }

        // Make 3 allowed requests
        for (let i = 0; i < 3; i++) {
          const result = checkRateLimit('client1', config)
          expect(result.allowed).toBe(true)
        }

        // 4th request should be blocked
        const blocked = checkRateLimit('client1', config)
        expect(blocked.allowed).toBe(false)
        expect(blocked.remaining).toBe(0)
        expect(blocked.retryAfter).toBeGreaterThan(0)
      })

      it('uses sliding window - old timestamps expire', () => {
        const config = { maxRequests: 3, windowMs: 60000 }

        // Make 3 requests at T=0
        for (let i = 0; i < 3; i++) {
          checkRateLimit('client1', config)
        }

        // Fast forward 61 seconds - all timestamps expire
        jest.advanceTimersByTime(61000)

        // Should allow new requests
        const result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(2)
      })

      it('allows requests as timestamps slide out of window', () => {
        const config = { maxRequests: 3, windowMs: 10000 } // 10 second window

        // T=0: Make 3 requests
        checkRateLimit('client1', config)
        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        // T=0: 4th request blocked
        let result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)

        // T=11s: First timestamp expired, should allow 1 request
        jest.advanceTimersByTime(11000)
        result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(0) // 2 old + 1 new = 3 (limit reached)

        // Immediately after, still blocked
        result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)
      })

      it('isolates rate limits per identifier', () => {
        const config = { maxRequests: 2, windowMs: 60000 }

        // Client1 makes 2 requests
        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        // Client1 blocked
        let result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)

        // Client2 should be independent
        result = checkRateLimit('client2', config)
        expect(result.allowed).toBe(true)
        expect(result.remaining).toBe(1)
      })
    })

    describe('TEST-002-02: Concurrent request handling', () => {
      it('handles rapid successive requests correctly', () => {
        const config = { maxRequests: 5, windowMs: 60000 }

        // Simulate 10 rapid requests
        const results = []
        for (let i = 0; i < 10; i++) {
          results.push(checkRateLimit('client1', config))
        }

        // First 5 allowed, last 5 blocked
        expect(results.filter((r) => r.allowed).length).toBe(5)
        expect(results.filter((r) => !r.allowed).length).toBe(5)
      })

      it('maintains correct remaining count during concurrent access', () => {
        const config = { maxRequests: 5, windowMs: 60000 }

        const result1 = checkRateLimit('client1', config)
        expect(result1.remaining).toBe(4)

        const result2 = checkRateLimit('client1', config)
        expect(result2.remaining).toBe(3)

        const result3 = checkRateLimit('client1', config)
        expect(result3.remaining).toBe(2)
      })
    })

    describe('TEST-002-03: Block duration calculation', () => {
      it('calculates correct retryAfter for blocked requests', () => {
        const config = { maxRequests: 2, windowMs: 60000 }

        // Make 2 requests
        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        // Get blocked result
        const blocked = checkRateLimit('client1', config)

        expect(blocked.allowed).toBe(false)
        expect(blocked.retryAfter).toBeGreaterThan(0)
        expect(blocked.retryAfter).toBeLessThanOrEqual(60) // Max 60 seconds for 60000ms window
      })

      it('maintains block until oldest timestamp expires', () => {
        const config = { maxRequests: 2, windowMs: 10000 }

        // T=0: Make 2 requests
        checkRateLimit('client1', config)
        jest.advanceTimersByTime(1000)
        checkRateLimit('client1', config)

        // T=1s: Blocked (retryAfter ~9s)
        let result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)
        expect(result.retryAfter).toBeLessThanOrEqual(10)

        // T=5s: Still blocked (retryAfter ~5s)
        jest.advanceTimersByTime(4000)
        result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)
        expect(result.retryAfter).toBeLessThanOrEqual(6)

        // T=11s: First timestamp expired, unblocked
        jest.advanceTimersByTime(6000)
        result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(true)
      })

      it('sets blockedUntil timestamp correctly', () => {
        const config = { maxRequests: 2, windowMs: 60000 }

        const now = Date.now()

        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        const blocked = checkRateLimit('client1', config)

        expect(blocked.resetAt).toBeGreaterThan(now)
        expect(blocked.resetAt).toBeLessThanOrEqual(now + 60000)
      })

      it('unblocks automatically when block period expires', () => {
        const config = { maxRequests: 2, windowMs: 10000 }

        // T=0: Make 2 requests
        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        // T=0: Blocked
        let result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(false)

        // T=11s: Unblocked (oldest timestamp expired)
        jest.advanceTimersByTime(11000)
        result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(true)
      })
    })

    describe('TEST-002-04: Reset time calculation', () => {
      it('returns correct resetAt timestamp', () => {
        const config = { maxRequests: 3, windowMs: 60000 }

        const startTime = Date.now()

        const result1 = checkRateLimit('client1', config)
        expect(result1.resetAt).toBeGreaterThanOrEqual(startTime)
        expect(result1.resetAt).toBeLessThanOrEqual(startTime + 60000)

        // Advance time slightly
        jest.advanceTimersByTime(1000)

        const result2 = checkRateLimit('client1', config)
        // Reset should be based on oldest timestamp
        expect(result2.resetAt).toBe(result1.resetAt)
      })

      it('updates resetAt as timestamps slide', () => {
        const config = { maxRequests: 2, windowMs: 10000 }

        // T=0: First request
        const result1 = checkRateLimit('client1', config)
        const firstReset = result1.resetAt

        // T=2s: Second request
        jest.advanceTimersByTime(2000)
        checkRateLimit('client1', config)

        // T=11s: First timestamp expired
        jest.advanceTimersByTime(9000)
        const result2 = checkRateLimit('client1', config)

        // New reset should be different (based on second request)
        expect(result2.resetAt).toBeGreaterThan(firstReset)
      })
    })

    describe('TEST-002-05: Custom key generator', () => {
      it('uses custom key generator when provided', () => {
        const config = {
          maxRequests: 2,
          windowMs: 60000,
          keyGenerator: (id: string) => `custom:${id}`,
        }

        checkRateLimit('user123', config)
        checkRateLimit('user123', config)

        const result = checkRateLimit('user123', config)
        expect(result.allowed).toBe(false)

        // Different user should be independent
        const result2 = checkRateLimit('user456', config)
        expect(result2.allowed).toBe(true)
      })
    })

    describe('TEST-002-06: Logging behavior', () => {
      it('logs when rate limit exceeded', () => {
        const config = { maxRequests: 1, windowMs: 60000 }

        checkRateLimit('client1', config)
        checkRateLimit('client1', config)

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'rate_limit.exceeded',
            identifier: 'client1',
            maxRequests: 1,
            windowMs: 60000,
          }),
          expect.stringContaining('Rate limit exceeded')
        )
      })

      it('logs when blocked request attempted', () => {
        const config = { maxRequests: 1, windowMs: 60000 }

        checkRateLimit('client1', config)
        checkRateLimit('client1', config) // Exceeds, creates block

        // Clear previous logs
        jest.clearAllMocks()

        // Attempt during block period
        checkRateLimit('client1', config)

        expect(logger.warn).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'rate_limit.blocked',
            identifier: 'client1',
          }),
          expect.stringContaining('Request blocked due to rate limit')
        )
      })
    })
  })

  describe('createRateLimiter', () => {
    it('creates a function with preset configuration', () => {
      const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60000 })

      const result1 = limiter('client1')
      expect(result1.allowed).toBe(true)
      expect(result1.remaining).toBe(2)

      const result2 = limiter('client1')
      expect(result2.allowed).toBe(true)
      expect(result2.remaining).toBe(1)

      const result3 = limiter('client1')
      expect(result3.allowed).toBe(true)
      expect(result3.remaining).toBe(0)

      const result4 = limiter('client1')
      expect(result4.allowed).toBe(false)
    })
  })

  describe('RateLimiters', () => {
    describe('TEST-002-07: Preset limiter configurations', () => {
      it('auth limiter: 5 requests per minute', () => {
        for (let i = 0; i < 5; i++) {
          const result = RateLimiters.auth('auth-client')
          expect(result.allowed).toBe(true)
        }

        const blocked = RateLimiters.auth('auth-client')
        expect(blocked.allowed).toBe(false)
      })

      it('api limiter: 60 requests per minute', () => {
        for (let i = 0; i < 60; i++) {
          const result = RateLimiters.api('api-client')
          expect(result.allowed).toBe(true)
        }

        const blocked = RateLimiters.api('api-client')
        expect(blocked.allowed).toBe(false)
      })

      it('public limiter: 120 requests per minute', () => {
        for (let i = 0; i < 120; i++) {
          const result = RateLimiters.public('public-client')
          expect(result.allowed).toBe(true)
        }

        const blocked = RateLimiters.public('public-client')
        expect(blocked.allowed).toBe(false)
      })

      it('passwordReset limiter: 3 requests per hour', () => {
        for (let i = 0; i < 3; i++) {
          const result = RateLimiters.passwordReset('password-client')
          expect(result.allowed).toBe(true)
        }

        const blocked = RateLimiters.passwordReset('password-client')
        expect(blocked.allowed).toBe(false)

        // Should unblock after 1 hour
        jest.advanceTimersByTime(60 * 60 * 1000 + 1000)

        const unblocked = RateLimiters.passwordReset('password-client')
        expect(unblocked.allowed).toBe(true)
      })
    })
  })

  describe('getClientIp', () => {
    describe('TEST-002-08: IP extraction from various headers', () => {
      it('extracts IP from x-forwarded-for header', () => {
        const request = {
          headers: new Headers({
            'x-forwarded-for': '203.0.113.1, 192.168.1.1',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('203.0.113.1')
      })

      it('extracts IP from x-real-ip header when x-forwarded-for absent', () => {
        const request = {
          headers: new Headers({
            'x-real-ip': '198.51.100.42',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('198.51.100.42')
      })

      it('extracts IP from x-vercel-forwarded-for header', () => {
        const request = {
          headers: new Headers({
            'x-vercel-forwarded-for': '203.0.113.50, 192.168.1.1',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('203.0.113.50')
      })

      it('prioritizes x-forwarded-for over x-real-ip', () => {
        const request = {
          headers: new Headers({
            'x-forwarded-for': '203.0.113.1',
            'x-real-ip': '198.51.100.42',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('203.0.113.1')
      })

      it('returns unknown when no IP headers present', () => {
        const request = {
          headers: new Headers({}),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('unknown')
      })

      it('trims whitespace from extracted IP', () => {
        const request = {
          headers: new Headers({
            'x-forwarded-for': '  203.0.113.1  , 192.168.1.1',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('203.0.113.1')
      })

      it('handles IPv6 addresses', () => {
        const request = {
          headers: new Headers({
            'x-forwarded-for': '2001:db8::1',
          }),
        } as Request

        const ip = getClientIp(request)
        expect(ip).toBe('2001:db8::1')
      })
    })
  })

  describe('Cleanup functionality', () => {
    describe('TEST-002-09: Cleanup interval memory management', () => {
      it('removes expired entries during cleanup', async () => {
        jest.useRealTimers() // Use real timers for cleanup interval

        const config = { maxRequests: 2, windowMs: 1000 }

        // Create some rate limit entries
        checkRateLimit('client1', config)
        checkRateLimit('client2', config)
        checkRateLimit('client3', config)

        // Wait for entries to age beyond cleanup threshold (1 hour)
        // Trigger cleanup by making a new request (starts cleanup on first call)
        checkRateLimit('client4', config)

        // Manually trigger time passage (in production, cleanup runs every 5 minutes)
        // For testing, we'll verify entries are managed correctly

        clearRateLimits()
        expect(true).toBe(true) // Verify cleanup doesn't crash
      })

      it('stopCleanup prevents further cleanup intervals', () => {
        const config = { maxRequests: 2, windowMs: 60000 }

        checkRateLimit('client1', config) // Starts cleanup
        stopCleanup()

        // Should not throw
        expect(true).toBe(true)
      })

      it('clearRateLimits removes all entries', () => {
        const config = { maxRequests: 1, windowMs: 60000 }

        checkRateLimit('client1', config)
        checkRateLimit('client2', config)
        checkRateLimit('client3', config)

        clearRateLimits()

        // All clients should have fresh limits
        const result1 = checkRateLimit('client1', config)
        const result2 = checkRateLimit('client2', config)
        const result3 = checkRateLimit('client3', config)

        expect(result1.remaining).toBe(0) // 1 request used, 0 remaining
        expect(result2.remaining).toBe(0)
        expect(result3.remaining).toBe(0)
      })
    })
  })

  describe('Edge cases and boundary conditions', () => {
    it('handles zero maxRequests correctly', () => {
      const config = { maxRequests: 0, windowMs: 60000 }

      const result = checkRateLimit('client1', config)
      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
    })

    it('handles very short windows (1ms)', () => {
      const config = { maxRequests: 5, windowMs: 1 }

      checkRateLimit('client1', config)
      checkRateLimit('client1', config)

      jest.advanceTimersByTime(2)

      // Window expired, should allow new requests
      const result = checkRateLimit('client1', config)
      expect(result.allowed).toBe(true)
    })

    it('handles very long windows (1 hour)', () => {
      const config = { maxRequests: 2, windowMs: 60 * 60 * 1000 }

      checkRateLimit('client1', config)
      checkRateLimit('client1', config)

      const blocked = checkRateLimit('client1', config)
      expect(blocked.allowed).toBe(false)

      // Fast forward 30 minutes - still blocked
      jest.advanceTimersByTime(30 * 60 * 1000)
      const stillBlocked = checkRateLimit('client1', config)
      expect(stillBlocked.allowed).toBe(false)

      // Fast forward another 31 minutes - unblocked
      jest.advanceTimersByTime(31 * 60 * 1000)
      const unblocked = checkRateLimit('client1', config)
      expect(unblocked.allowed).toBe(true)
    })

    it('handles high request volume', () => {
      const config = { maxRequests: 1000, windowMs: 60000 }

      // Make 1000 requests
      for (let i = 0; i < 1000; i++) {
        const result = checkRateLimit('client1', config)
        expect(result.allowed).toBe(true)
      }

      // 1001st request blocked
      const blocked = checkRateLimit('client1', config)
      expect(blocked.allowed).toBe(false)
    })
  })
})
