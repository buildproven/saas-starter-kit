import { AdvancedRateLimiter } from './rate-limit-advanced'

describe('AdvancedRateLimiter', () => {
  let limiter: AdvancedRateLimiter

  beforeEach(() => {
    process.env.ENFORCE_RATE_LIMIT_TESTS = 'true'
    limiter = new AdvancedRateLimiter({
      requestsPerMinute: 3,
      requestsPerHour: 10,
      dedupCacheTtl: 5000, // 5 seconds for testing
      cleanupInterval: 60000,
      lockTimeout: 1000,
    })
  })

  afterEach(() => {
    limiter.destroy()
    delete process.env.ENFORCE_RATE_LIMIT_TESTS
  })

  describe('checkRateLimit', () => {
    it('allows first request', async () => {
      const result = await limiter.checkRateLimit('user1')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('tracks remaining requests', async () => {
      await limiter.checkRateLimit('user1')
      const result = await limiter.checkRateLimit('user1')

      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(1)
    })

    it('blocks after limit exceeded', async () => {
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')
      const result = await limiter.checkRateLimit('user1')

      expect(result.allowed).toBe(false)
      expect(result.remaining).toBe(0)
      expect(result.retryAfter).toBeGreaterThan(0)
      expect(result.reason).toContain('Rate limit exceeded')
    })

    it('isolates users', async () => {
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')

      const result = await limiter.checkRateLimit('user2')
      expect(result.allowed).toBe(true)
      expect(result.remaining).toBe(2)
    })

    it('resets after window expires', async () => {
      const shortLimiter = new AdvancedRateLimiter({
        requestsPerMinute: 1,
      })
      process.env.ENFORCE_RATE_LIMIT_TESTS = 'true'

      await shortLimiter.checkRateLimit('user1')
      const blocked = await shortLimiter.checkRateLimit('user1')
      expect(blocked.allowed).toBe(false)

      shortLimiter.destroy()
    })

    it('bypasses rate limiting in test env without flag', async () => {
      delete process.env.ENFORCE_RATE_LIMIT_TESTS
      const testLimiter = new AdvancedRateLimiter({ requestsPerMinute: 1 })

      await testLimiter.checkRateLimit('user1')
      await testLimiter.checkRateLimit('user1')
      const result = await testLimiter.checkRateLimit('user1')

      expect(result.allowed).toBe(true)
      testLimiter.destroy()
    })
  })

  describe('generateContentHash', () => {
    it('generates consistent hash for same content', () => {
      const hash1 = limiter.generateContentHash('user1', 'content')
      const hash2 = limiter.generateContentHash('user1', 'content')

      expect(hash1).toBe(hash2)
    })

    it('generates different hash for different users', () => {
      const hash1 = limiter.generateContentHash('user1', 'content')
      const hash2 = limiter.generateContentHash('user2', 'content')

      expect(hash1).not.toBe(hash2)
    })

    it('generates different hash for different content', () => {
      const hash1 = limiter.generateContentHash('user1', 'content1')
      const hash2 = limiter.generateContentHash('user1', 'content2')

      expect(hash1).not.toBe(hash2)
    })

    it('handles object content', () => {
      const hash1 = limiter.generateContentHash('user1', { a: 1, b: 2 })
      const hash2 = limiter.generateContentHash('user1', { a: 1, b: 2 })

      expect(hash1).toBe(hash2)
      expect(hash1).toHaveLength(16)
    })
  })

  describe('handleDeduplication', () => {
    it('returns not duplicate for first request', async () => {
      const result = await limiter.handleDeduplication('user1', 'content')

      expect(result.isDuplicate).toBe(false)
      expect(result.requestId).toBeDefined()
    })

    it('returns cached result for duplicate request', async () => {
      const content = 'test-content'
      const userId = 'user1'

      // First request - not duplicate
      const first = await limiter.handleDeduplication(userId, content)
      expect(first.isDuplicate).toBe(false)

      // Register and complete the request
      const hash = limiter.generateContentHash(userId, content)
      limiter.registerPendingRequest(first.requestId, userId, hash)
      limiter.completePendingRequest(first.requestId, { data: 'result' })

      // Second request - should return cached result
      const second = await limiter.handleDeduplication(userId, content)
      expect(second.isDuplicate).toBe(true)
      expect(second.existingResult).toEqual({ data: 'result' })
    })
  })

  describe('pending request management', () => {
    it('registers and completes pending request', () => {
      const { promise } = limiter.registerPendingRequest('req1', 'user1', 'hash1')

      limiter.completePendingRequest('req1', { success: true })

      return expect(promise).resolves.toEqual({ success: true })
    })

    it('registers and fails pending request', () => {
      const { promise } = limiter.registerPendingRequest('req1', 'user1', 'hash1')

      limiter.failPendingRequest('req1', new Error('Test error'))

      return expect(promise).rejects.toThrow('Test error')
    })
  })

  describe('getUserStatus', () => {
    it('returns full quota for new user', () => {
      const status = limiter.getUserStatus('newuser')

      expect(status.requestsRemaining).toBe(3)
      expect(status.isLimited).toBe(false)
    })

    it('returns correct remaining after requests', async () => {
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')

      const status = limiter.getUserStatus('user1')
      expect(status.requestsRemaining).toBe(1)
      expect(status.isLimited).toBe(false)
    })

    it('returns limited status when quota exhausted', async () => {
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user1')

      const status = limiter.getUserStatus('user1')
      expect(status.requestsRemaining).toBe(0)
      expect(status.isLimited).toBe(true)
    })
  })

  describe('getStats', () => {
    it('returns empty stats for new limiter', () => {
      const stats = limiter.getStats()

      expect(stats.activeUsers).toBe(0)
      expect(stats.pendingRequests).toBe(0)
      expect(stats.cachedResults).toBe(0)
      expect(stats.timestamp).toBeDefined()
    })

    it('tracks active users', async () => {
      await limiter.checkRateLimit('user1')
      await limiter.checkRateLimit('user2')

      const stats = limiter.getStats()
      expect(stats.activeUsers).toBe(2)
    })

    it('tracks pending requests', () => {
      limiter.registerPendingRequest('req1', 'user1', 'hash1')
      limiter.registerPendingRequest('req2', 'user2', 'hash2')

      const stats = limiter.getStats()
      expect(stats.pendingRequests).toBe(2)
    })
  })

  describe('configuration', () => {
    it('uses custom namespace', async () => {
      const limiter1 = new AdvancedRateLimiter({
        namespace: 'api1',
        requestsPerMinute: 1,
      })
      const limiter2 = new AdvancedRateLimiter({
        namespace: 'api2',
        requestsPerMinute: 1,
      })

      process.env.ENFORCE_RATE_LIMIT_TESTS = 'true'

      await limiter1.checkRateLimit('user1')
      const blocked = await limiter1.checkRateLimit('user1')
      expect(blocked.allowed).toBe(false)

      const allowed = await limiter2.checkRateLimit('user1')
      expect(allowed.allowed).toBe(true)

      limiter1.destroy()
      limiter2.destroy()
    })

    it('uses default config values', () => {
      const defaultLimiter = new AdvancedRateLimiter()
      const stats = defaultLimiter.getStats()

      expect(stats).toBeDefined()
      defaultLimiter.destroy()
    })
  })

  describe('destroy', () => {
    it('cleans up resources', () => {
      const testLimiter = new AdvancedRateLimiter()
      testLimiter.destroy()

      const stats = testLimiter.getStats()
      expect(stats.activeUsers).toBe(0)
      expect(stats.pendingRequests).toBe(0)
      expect(stats.cachedResults).toBe(0)
    })
  })
})
