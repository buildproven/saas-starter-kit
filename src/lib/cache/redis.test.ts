/**
 * Tests for Redis Cache Client
 */

const mockFetch = vi.fn()
global.fetch = mockFetch

// Must mock before importing
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

describe('RedisCache', () => {
  let RedisCache: typeof import('./redis').RedisCache
  let cache: import('./redis').RedisCache

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()

    // Reset env vars
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.PRIVACY_MODE

    // Re-import fresh module
    const redisModule = await import('./redis')
    RedisCache = redisModule.RedisCache
  })

  describe('initialization', () => {
    it('initializes with environment variables', () => {
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test_token'

      cache = new RedisCache()
      expect(cache.isAvailable()).toBe(true)
    })

    it('initializes with config parameters', () => {
      cache = new RedisCache({
        url: 'https://redis.example.com',
        token: 'test_token',
      })
      expect(cache.isAvailable()).toBe(true)
    })

    it('handles missing configuration gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      cache = new RedisCache()
      expect(cache.isAvailable()).toBe(false)

      warnSpy.mockRestore()
    })

    it('disables caching in privacy mode', () => {
      process.env.PRIVACY_MODE = 'true'
      process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example.com'
      process.env.UPSTASH_REDIS_REST_TOKEN = 'test_token'

      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

      cache = new RedisCache()
      expect(cache.isAvailable()).toBe(false)

      infoSpy.mockRestore()
    })
  })

  describe('with configured cache', () => {
    beforeEach(() => {
      cache = new RedisCache({
        url: 'https://redis.example.com',
        token: 'test_token',
        ttl: 3600,
      })
    })

    describe('generateKey', () => {
      it('generates consistent keys for same identifiers', () => {
        const key1 = cache.generateKey('prefix', ['id1', 'id2'])
        const key2 = cache.generateKey('prefix', ['id2', 'id1'])
        expect(key1).toBe(key2)
      })

      it('includes options in key', () => {
        const key = cache.generateKey('prefix', ['id1'], { option: 'value' })
        expect(key).toContain('option:value')
      })
    })

    describe('get', () => {
      it('returns cached data on hit', async () => {
        const cachedData = {
          data: { foo: 'bar' },
          metadata: { cachedAt: '2024-01-01', ttl: 3600, source: 'test' },
        }

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: JSON.stringify(cachedData) }],
        })

        const result = await cache.get<{ foo: string }>('test_key')
        expect(result?.data.foo).toBe('bar')
      })

      it('returns null on cache miss', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: null }],
        })

        const result = await cache.get('missing_key')
        expect(result).toBeNull()
      })

      it('handles fetch errors gracefully', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network error'))

        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const result = await cache.get('error_key')

        expect(result).toBeNull()
        errorSpy.mockRestore()
      })
    })

    describe('set', () => {
      it('stores data with metadata', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'OK' }],
        })

        const result = await cache.set('key', { data: 'value' }, 'test_source')
        expect(result).toBe(true)

        const requestBody = JSON.parse(mockFetch.mock.calls[0]![1].body)
        expect(requestBody[0][0]).toBe('SETEX')
        expect(requestBody[0][1]).toBe('key')
      })

      it('uses custom TTL when provided', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'OK' }],
        })

        await cache.set('key', { data: 'value' }, 'source', 7200)

        const requestBody = JSON.parse(mockFetch.mock.calls[0]![1].body)
        expect(requestBody[0][2]).toBe('7200')
      })
    })

    describe('delete', () => {
      it('deletes key from cache', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 1 }],
        })

        const result = await cache.delete('key_to_delete')
        expect(result).toBe(true)
      })
    })

    describe('flush', () => {
      it('flushes entire cache', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'OK' }],
        })

        const result = await cache.flush()
        expect(result).toBe(true)
      })
    })

    describe('purgeByPattern', () => {
      it('purges keys matching pattern', async () => {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ result: ['prefix:key1', 'prefix:key2'] }],
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => [{ result: 2 }],
          })

        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
        const count = await cache.purgeByPattern('prefix:')

        expect(count).toBe(2)
        infoSpy.mockRestore()
      })

      it('returns 0 when no keys match', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: [] }],
        })

        const count = await cache.purgeByPattern('nonexistent:')
        expect(count).toBe(0)
      })
    })

    describe('ping', () => {
      it('returns true on successful ping', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'PONG' }],
        })

        const result = await cache.ping()
        expect(result).toBe(true)
      })

      it('returns false on failed ping', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'ERROR' }],
        })

        const result = await cache.ping()
        expect(result).toBe(false)
      })
    })

    describe('getMultiple', () => {
      it('returns map of cached values', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              result: [
                JSON.stringify({ data: 'value1', metadata: {} }),
                null,
                JSON.stringify({ data: 'value3', metadata: {} }),
              ],
            },
          ],
        })

        const result = await cache.getMultiple(['key1', 'key2', 'key3'])

        expect(result.size).toBe(2)
        expect(result.get('key1')?.data).toBe('value1')
        expect(result.has('key2')).toBe(false)
      })

      it('returns empty map for empty keys array', async () => {
        const result = await cache.getMultiple([])
        expect(result.size).toBe(0)
      })
    })

    describe('setMultiple', () => {
      it('sets multiple entries', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => [{ result: 'OK' }, { result: 'OK' }],
        })

        const result = await cache.setMultiple([
          { key: 'key1', data: 'value1', source: 'test' },
          { key: 'key2', data: 'value2', source: 'test' },
        ])

        expect(result).toBe(true)
      })

      it('returns false for empty entries', async () => {
        const result = await cache.setMultiple([])
        expect(result).toBe(false)
      })
    })
  })

  describe('with unconfigured cache', () => {
    beforeEach(() => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      cache = new RedisCache()
      warnSpy.mockRestore()
    })

    it('returns null for get', async () => {
      const result = await cache.get('any_key')
      expect(result).toBeNull()
    })

    it('returns false for set', async () => {
      const result = await cache.set('key', 'value', 'source')
      expect(result).toBe(false)
    })

    it('returns false for delete', async () => {
      const result = await cache.delete('key')
      expect(result).toBe(false)
    })

    it('returns false for flush', async () => {
      const result = await cache.flush()
      expect(result).toBe(false)
    })

    it('returns 0 for purgeByPattern', async () => {
      const result = await cache.purgeByPattern('pattern')
      expect(result).toBe(0)
    })

    it('returns false for ping', async () => {
      const result = await cache.ping()
      expect(result).toBe(false)
    })
  })
})
