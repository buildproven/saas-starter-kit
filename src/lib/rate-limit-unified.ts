/**
 * Unified Rate Limiting - Canonical Reference Implementation
 *
 * Features:
 * - Upstash Redis first, memory fallback (dev/test only)
 * - HMAC-based spoof-resistant client identification
 * - Production REQUIRES Redis (throws if missing)
 * - Fail-closed in production, fail-open in dev
 * - Simple facade: rateLimit(key, limit, windowMs)
 *
 * Environment Variables:
 * - UPSTASH_REDIS_REST_URL (required in prod)
 * - UPSTASH_REDIS_REST_TOKEN (required in prod)
 * - RATE_LIMIT_HMAC_SECRET (required in prod for client ID generation)
 *
 * Usage:
 *   import { rateLimit, getClientId } from '@/lib/rate-limit-unified'
 *
 *   const clientId = getClientId(request)
 *   const result = await rateLimit(clientId, 60, 60_000)
 *   if (!result.allowed) {
 *     return new Response('Too Many Requests', {
 *       status: 429,
 *       headers: { 'Retry-After': String(result.retryAfter) }
 *     })
 *   }
 */

import { createHmac } from 'crypto'

// ============================================================================
// Types
// ============================================================================

export interface RateLimitResponse {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter: number
}

interface RateLimitEntry {
  count: number
  windowStart: number
  expiresAt: number
}

interface RateLimitStorage {
  increment(key: string, ttlMs: number): Promise<number>
  get(key: string): Promise<RateLimitEntry | null>
}

// ============================================================================
// Storage Implementations
// ============================================================================

class RedisStorage implements RateLimitStorage {
  private baseUrl: string
  private token: string

  constructor(url: string, token: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.token = token
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['EXPIRE', key, Math.ceil(ttlMs / 1000).toString()],
      ]),
    })

    if (!response.ok) {
      throw new Error(`Redis pipeline failed: ${response.status}`)
    }

    const results = (await response.json()) as Array<{
      result?: number
      error?: string
    }>

    if (results[0]?.error) {
      throw new Error(`Redis INCR error: ${results[0].error}`)
    }

    return results[0]?.result ?? 0
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const response = await fetch(`${this.baseUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([['GET', key]]),
    })

    if (!response.ok) {
      return null
    }

    const results = (await response.json()) as Array<{
      result?: string | null
      error?: string
    }>

    const data = results[0]?.result
    return data && typeof data === 'string' ? JSON.parse(data) : null
  }
}

class MemoryStorage implements RateLimitStorage {
  private store = new Map<string, RateLimitEntry>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanup()
  }

  private startCleanup(): void {
    if (this.cleanupInterval) return
    this.cleanupInterval = setInterval(() => {
      const now = Date.now()
      for (const [key, entry] of this.store.entries()) {
        if (entry.expiresAt <= now) {
          this.store.delete(key)
        }
      }
    }, 60 * 1000) // Cleanup every minute
  }

  async increment(key: string, ttlMs: number): Promise<number> {
    const now = Date.now()
    const windowStart = Math.floor(now / ttlMs) * ttlMs
    const expiresAt = windowStart + ttlMs

    const existing = this.store.get(key)
    const isExpired = !existing || existing.expiresAt <= now

    const newCount = isExpired ? 1 : existing.count + 1
    this.store.set(key, { count: newCount, windowStart, expiresAt })

    return newCount
  }

  async get(key: string): Promise<RateLimitEntry | null> {
    const entry = this.store.get(key)
    if (!entry || entry.expiresAt <= Date.now()) {
      this.store.delete(key)
      return null
    }
    return entry
  }

  clear(): void {
    this.store.clear()
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}

// ============================================================================
// Storage Factory (Singleton)
// ============================================================================

let cachedStorage: RateLimitStorage | null = null
let memoryStorageInstance: MemoryStorage | null = null

function getStorage(): RateLimitStorage {
  if (cachedStorage) return cachedStorage

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const isProd = process.env.NODE_ENV === 'production'

  // Production REQUIRES Redis - fail fast
  if (isProd && (!redisUrl || !redisToken)) {
    throw new Error(
      'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required in production.\n' +
        'In-memory rate limiting is insecure in production (no cross-instance coordination).\n' +
        'Get free Redis at: https://upstash.com'
    )
  }

  if (redisUrl && redisToken) {
    cachedStorage = new RedisStorage(redisUrl, redisToken)
    console.info('[RateLimit] Using Upstash Redis')
  } else {
    memoryStorageInstance = new MemoryStorage()
    cachedStorage = memoryStorageInstance
    console.warn(
      '[RateLimit] Using in-memory storage (dev/test only). ' +
        'Configure UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production.'
    )
  }

  return cachedStorage
}

// ============================================================================
// Client Identification (HMAC Spoof-Resistant)
// ============================================================================

/**
 * Generate a spoof-resistant client identifier from request headers.
 *
 * Uses:
 * - CF-Connecting-IP (Cloudflare) > X-Forwarded-For > X-Real-IP > X-Vercel-Forwarded-For
 * - HMAC of User-Agent to make simple IP spoofing harder
 *
 * @param request - Incoming request (works with both Node Request and Edge Request)
 * @returns Client identifier string (IP:UAHash format)
 */
export function getClientId(request: Request): string {
  const headers = request.headers

  // Priority: CF-Connecting-IP (Cloudflare) is hardest to spoof
  const cfConnectingIp = headers.get('cf-connecting-ip')
  const xForwardedFor = headers.get('x-forwarded-for')
  const xRealIp = headers.get('x-real-ip')
  const xVercelForwardedFor = headers.get('x-vercel-forwarded-for')

  const clientIp =
    cfConnectingIp ||
    (xForwardedFor ? xForwardedFor.split(',')[0]?.trim() : null) ||
    xRealIp ||
    (xVercelForwardedFor ? xVercelForwardedFor.split(',')[0]?.trim() : null) ||
    'unknown'

  // HMAC of User-Agent adds entropy, making simple IP spoofing less effective
  const userAgent = headers.get('user-agent') || ''
  const hmacSecret = process.env.RATE_LIMIT_HMAC_SECRET
  const isProd = process.env.NODE_ENV === 'production'

  // Production requires HMAC secret for secure client identification
  if (isProd && !hmacSecret) {
    throw new Error(
      'RATE_LIMIT_HMAC_SECRET is required in production for secure client identification.'
    )
  }

  const effectiveSecret = hmacSecret || 'dev-only-insecure-fallback'
  const userAgentHash = createHmac('sha256', effectiveSecret)
    .update(userAgent)
    .digest('hex')
    .substring(0, 8) // First 8 chars for brevity

  return `${clientIp}:${userAgentHash}`
}

/**
 * Extract client IP only (without UA hash) - useful for logging
 */
export function getClientIp(request: Request): string {
  const headers = request.headers
  const xForwardedFor = headers.get('x-forwarded-for')
  const xVercelForwardedFor = headers.get('x-vercel-forwarded-for')

  return (
    headers.get('cf-connecting-ip') ||
    (xForwardedFor ? xForwardedFor.split(',')[0]?.trim() : null) ||
    headers.get('x-real-ip') ||
    (xVercelForwardedFor ? xVercelForwardedFor.split(',')[0]?.trim() : null) ||
    'unknown'
  )
}

// ============================================================================
// Rate Limit Facade
// ============================================================================

/**
 * Check rate limit for a given key.
 *
 * @param key - Unique identifier (use getClientId for IP-based, or userId for user-based)
 * @param limit - Max requests allowed in window (default: 60)
 * @param windowMs - Window size in milliseconds (default: 60000 = 1 minute)
 * @returns Rate limit result with allowed status and metadata
 *
 * @example
 * // IP-based rate limiting
 * const clientId = getClientId(request)
 * const result = await rateLimit(clientId, 60, 60_000)
 *
 * @example
 * // User-based rate limiting
 * const result = await rateLimit(`user:${userId}`, 100, 60_000)
 *
 * @example
 * // Endpoint-specific rate limiting
 * const result = await rateLimit(`auth:${clientId}`, 5, 60_000)
 */
export async function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): Promise<RateLimitResponse> {
  const storage = getStorage()
  const now = Date.now()
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs
  const storageKey = `ratelimit:${key}:${windowStart}`

  try {
    const count = await storage.increment(storageKey, windowMs)

    if (count > limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil((resetAt - now) / 1000),
      }
    }

    return {
      allowed: true,
      remaining: limit - count,
      resetAt,
      retryAfter: 0,
    }
  } catch (error) {
    console.error('[RateLimit] Storage error:', error)

    // Fail-closed in production (deny on error), fail-open in dev (allow on error)
    const isProd = process.env.NODE_ENV === 'production'

    if (isProd) {
      console.error('[RateLimit] Denying request due to storage failure (fail-closed)')
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: 60,
      }
    }

    console.warn('[RateLimit] Allowing request due to storage failure (fail-open, dev mode)')
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt,
      retryAfter: 0,
    }
  }
}

// ============================================================================
// Preset Rate Limiters
// ============================================================================

/**
 * Pre-configured rate limiters for common use cases.
 * Each returns a function that takes a key and returns a RateLimitResponse.
 */
export const RateLimiters = {
  /** Authentication endpoints: 5 requests per minute */
  auth: (key: string) => rateLimit(`auth:${key}`, 5, 60_000),

  /** Password reset: 3 requests per hour */
  passwordReset: (key: string) => rateLimit(`pwreset:${key}`, 3, 60 * 60_000),

  /** Standard API endpoints: 60 requests per minute */
  api: (key: string) => rateLimit(`api:${key}`, 60, 60_000),

  /** Public/anonymous endpoints: 30 requests per minute */
  public: (key: string) => rateLimit(`public:${key}`, 30, 60_000),

  /** AI/expensive operations: 10 requests per minute */
  expensive: (key: string) => rateLimit(`expensive:${key}`, 10, 60_000),

  /** Health checks: 60 requests per minute */
  health: (key: string) => rateLimit(`health:${key}`, 60, 60_000),
}

// ============================================================================
// HTTP Response Helpers
// ============================================================================

/**
 * Create standard rate limit headers for responses.
 */
export function rateLimitHeaders(result: RateLimitResponse): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.remaining + (result.allowed ? 0 : 1)),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': new Date(result.resetAt).toISOString(),
    ...(result.retryAfter > 0 && { 'Retry-After': String(result.retryAfter) }),
  }
}

/**
 * Create a 429 Too Many Requests response.
 */
export function rateLimitResponse(result: RateLimitResponse): Response {
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.',
      retryAfter: result.retryAfter,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        ...rateLimitHeaders(result),
      },
    }
  )
}

// ============================================================================
// Testing Utilities
// ============================================================================

/**
 * Clear the storage cache (for testing only).
 */
export function __clearStorageCache(): void {
  if (memoryStorageInstance) {
    memoryStorageInstance.clear()
    memoryStorageInstance.stopCleanup()
  }
  cachedStorage = null
  memoryStorageInstance = null
}

/**
 * Get the current storage type (for debugging/monitoring).
 */
export function getStorageType(): 'redis' | 'memory' {
  const storage = getStorage()
  return storage instanceof RedisStorage ? 'redis' : 'memory'
}
