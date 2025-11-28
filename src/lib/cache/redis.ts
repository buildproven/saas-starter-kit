/**
 * Redis Cache Client
 *
 * Generic Redis caching using Upstash Redis REST API.
 *
 * Environment variables required:
 * - UPSTASH_REDIS_REST_URL
 * - UPSTASH_REDIS_REST_TOKEN
 *
 * If not configured, cache operations will gracefully fail and fall through.
 *
 * Ported from keyflash for cross-project caching standards.
 */

export interface CacheConfig {
  url?: string
  token?: string
  ttl?: number
}

export interface CacheMetadata {
  cachedAt: string
  ttl: number
  source: string
}

export interface CachedData<T> {
  data: T
  metadata: CacheMetadata
}

class RedisCache {
  private baseUrl: string | null = null
  private token: string | null = null
  private isConfigured = false
  private privacyMode = false
  private defaultTTL = 7 * 24 * 60 * 60 // 7 days in seconds

  constructor(config?: CacheConfig) {
    const url = config?.url || process.env.UPSTASH_REDIS_REST_URL
    const token = config?.token || process.env.UPSTASH_REDIS_REST_TOKEN
    const ttl = config?.ttl || this.defaultTTL

    const privacyEnv = process.env.PRIVACY_MODE
    this.privacyMode = privacyEnv === 'true'

    if (this.privacyMode) {
      console.info('[RedisCache] Privacy mode enabled. Caching is disabled.')
      return
    }

    if (url && token) {
      try {
        this.baseUrl = url.replace(/\/$/, '')
        this.token = token
        this.isConfigured = true
        this.defaultTTL = ttl
      } catch (error) {
        console.error('[RedisCache] Failed to initialize Redis client:', error)
        this.isConfigured = false
      }
    } else {
      console.warn(
        '[RedisCache] Redis not configured. Cache operations will be skipped. ' +
          'Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to enable caching.'
      )
    }
  }

  private async request(
    commands: string[][]
  ): Promise<Array<{ result?: unknown; error?: string }>> {
    if (!this.baseUrl || !this.token) {
      throw new Error('Redis not configured')
    }

    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commands),
    })

    if (!response.ok) {
      throw new Error(`Redis request failed: ${response.status}`)
    }

    return response.json() as Promise<Array<{ result?: unknown; error?: string }>>
  }

  isAvailable(): boolean {
    if (this.privacyMode) {
      return false
    }
    return this.isConfigured && this.baseUrl !== null
  }

  generateKey(prefix: string, identifiers: string[], options: Record<string, string> = {}): string {
    const sortedIdentifiers = [...identifiers].sort()
    const keyHash = this.simpleHash(sortedIdentifiers.join(','))
    const optionsSuffix = Object.entries(options)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(':')

    return optionsSuffix ? `${prefix}:${optionsSuffix}:${keyHash}` : `${prefix}:${keyHash}`
  }

  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  async get<T>(key: string): Promise<CachedData<T> | null> {
    if (!this.isAvailable()) {
      return null
    }

    try {
      const results = await this.request([['GET', key]])
      const result = results[0]?.result

      if (result && typeof result === 'string') {
        return JSON.parse(result) as CachedData<T>
      }
      return null
    } catch (error) {
      console.error('[RedisCache] Failed to get from cache:', error)
      return null
    }
  }

  async set<T>(key: string, data: T, source: string, ttl?: number): Promise<boolean> {
    if (!this.isAvailable()) {
      return false
    }

    const cacheTTL = ttl || this.defaultTTL

    const cacheData: CachedData<T> = {
      data,
      metadata: {
        cachedAt: new Date().toISOString(),
        ttl: cacheTTL,
        source,
      },
    }

    try {
      await this.request([['SETEX', key, cacheTTL.toString(), JSON.stringify(cacheData)]])
      return true
    } catch (error) {
      console.error('[RedisCache] Failed to set cache:', error)
      return false
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.isAvailable()) {
      return false
    }

    try {
      await this.request([['DEL', key]])
      return true
    } catch (error) {
      console.error('[RedisCache] Failed to delete from cache:', error)
      return false
    }
  }

  async flush(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false
    }

    try {
      await this.request([['FLUSHDB']])
      return true
    } catch (error) {
      console.error('[RedisCache] Failed to flush cache:', error)
      return false
    }
  }

  async purgeByPattern(pattern: string): Promise<number> {
    if (!this.isAvailable()) {
      return 0
    }

    try {
      const results = await this.request([['KEYS', `${pattern}*`]])
      const keys = results[0]?.result as string[] | undefined

      if (!keys || keys.length === 0) {
        return 0
      }

      await this.request([['DEL', ...keys]])
      console.info(`[RedisCache] Purged ${keys.length} cache entries`)
      return keys.length
    } catch (error) {
      console.error('[RedisCache] Failed to purge cache:', error)
      return 0
    }
  }

  async ping(): Promise<boolean> {
    if (!this.isAvailable()) {
      return false
    }

    try {
      const results = await this.request([['PING']])
      return results[0]?.result === 'PONG'
    } catch (error) {
      console.error('[RedisCache] Ping failed:', error)
      return false
    }
  }

  async getMultiple<T>(keys: string[]): Promise<Map<string, CachedData<T>>> {
    if (!this.isAvailable() || keys.length === 0) {
      return new Map()
    }

    try {
      const results = await this.request([['MGET', ...keys]])
      const values = results[0]?.result as (string | null)[] | undefined
      const resultMap = new Map<string, CachedData<T>>()

      if (values) {
        keys.forEach((key, index) => {
          const value = values[index]
          if (value) {
            try {
              resultMap.set(key, JSON.parse(value) as CachedData<T>)
            } catch {
              // Skip invalid JSON
            }
          }
        })
      }

      return resultMap
    } catch (error) {
      console.error('[RedisCache] Failed to get multiple from cache:', error)
      return new Map()
    }
  }

  async setMultiple<T>(
    entries: Array<{ key: string; data: T; source: string; ttl?: number }>
  ): Promise<boolean> {
    if (!this.isAvailable() || entries.length === 0) {
      return false
    }

    try {
      const commands = entries.map((entry) => {
        const cacheTTL = entry.ttl || this.defaultTTL
        const cacheData: CachedData<T> = {
          data: entry.data,
          metadata: {
            cachedAt: new Date().toISOString(),
            ttl: cacheTTL,
            source: entry.source,
          },
        }
        return ['SETEX', entry.key, cacheTTL.toString(), JSON.stringify(cacheData)]
      })

      await this.request(commands)
      return true
    } catch (error) {
      console.error('[RedisCache] Failed to set multiple in cache:', error)
      return false
    }
  }
}

export const cache = new RedisCache()
export { RedisCache }
