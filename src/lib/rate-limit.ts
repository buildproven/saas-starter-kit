/**
 * Rate Limiting Utilities
 *
 * In-memory rate limiting using sliding window algorithm.
 * For production at scale, consider using Redis for distributed rate limiting.
 */

import { logger } from './logger'

interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  maxRequests: number
  /** Window duration in milliseconds */
  windowMs: number
  /** Optional: function to extract identifier from request (defaults to IP) */
  keyGenerator?: (identifier: string) => string
}

interface RateLimitEntry {
  timestamps: number[]
  blocked: boolean
  blockedUntil?: number
}

// In-memory store: Map<identifier, RateLimitEntry>
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup interval: remove old entries every 5 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null

/**
 * Start periodic cleanup of old rate limit entries
 */
function startCleanup() {
  if (cleanupIntervalId) return

  cleanupIntervalId = setInterval(() => {
    const now = Date.now()
    const cutoff = now - 60 * 60 * 1000 // Remove entries older than 1 hour

    for (const [key, entry] of rateLimitStore.entries()) {
      // Remove if all timestamps are old or blocked period has expired
      if (
        entry.timestamps.every((ts) => ts < cutoff) ||
        (entry.blockedUntil && entry.blockedUntil < now)
      ) {
        rateLimitStore.delete(key)
      }
    }

    logger.debug(
      { type: 'rate_limit.cleanup', remainingEntries: rateLimitStore.size },
      'Rate limit cleanup completed'
    )
  }, CLEANUP_INTERVAL_MS)
}

/**
 * Check if request should be rate limited
 *
 * @param identifier - Unique identifier for the client (e.g., IP address, user ID)
 * @param config - Rate limit configuration
 * @returns Object with allowed status and remaining requests
 *
 * @example
 * ```typescript
 * const result = checkRateLimit(clientIp, {
 *   maxRequests: 5,
 *   windowMs: 60000 // 1 minute
 * })
 *
 * if (!result.allowed) {
 *   return NextResponse.json(
 *     { error: 'Rate limit exceeded' },
 *     { status: 429 }
 *   )
 * }
 * ```
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter?: number
} {
  startCleanup()

  const now = Date.now()
  const windowStart = now - config.windowMs
  const key = config.keyGenerator ? config.keyGenerator(identifier) : identifier

  // Get or create entry
  let entry = rateLimitStore.get(key)
  if (!entry) {
    entry = { timestamps: [], blocked: false }
    rateLimitStore.set(key, entry)
  }

  // Check if currently blocked
  if (entry.blocked && entry.blockedUntil && entry.blockedUntil > now) {
    const retryAfter = Math.ceil((entry.blockedUntil - now) / 1000)
    logger.warn(
      {
        type: 'rate_limit.blocked',
        identifier: key,
        retryAfter,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
      },
      'Request blocked due to rate limit'
    )
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.blockedUntil,
      retryAfter,
    }
  }

  // Remove timestamps outside the current window (sliding window)
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

  // Check if limit exceeded
  if (entry.timestamps.length >= config.maxRequests) {
    // Block for the remaining window duration
    const oldestTimestamp = Math.min(...entry.timestamps)
    const blockedUntil = oldestTimestamp + config.windowMs
    entry.blocked = true
    entry.blockedUntil = blockedUntil

    const retryAfter = Math.ceil((blockedUntil - now) / 1000)

    logger.warn(
      {
        type: 'rate_limit.exceeded',
        identifier: key,
        requestCount: entry.timestamps.length,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        retryAfter,
      },
      'Rate limit exceeded'
    )

    return {
      allowed: false,
      remaining: 0,
      resetAt: blockedUntil,
      retryAfter,
    }
  }

  // Allow request and record timestamp
  entry.timestamps.push(now)
  entry.blocked = false
  delete entry.blockedUntil

  const remaining = config.maxRequests - entry.timestamps.length
  const resetAt = Math.min(...entry.timestamps) + config.windowMs

  return {
    allowed: true,
    remaining,
    resetAt,
  }
}

/**
 * Create a rate limit checker with preset configuration
 *
 * @param config - Rate limit configuration
 * @returns Function that checks rate limit for an identifier
 *
 * @example
 * ```typescript
 * const authLimiter = createRateLimiter({
 *   maxRequests: 5,
 *   windowMs: 60000 // 5 requests per minute
 * })
 *
 * const result = authLimiter(clientIp)
 * if (!result.allowed) {
 *   // Rate limited
 * }
 * ```
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (identifier: string) => checkRateLimit(identifier, config)
}

/**
 * Preset rate limiters for common use cases
 */
export const RateLimiters = {
  /** Strict rate limit for authentication endpoints: 5 requests per minute */
  auth: createRateLimiter({
    maxRequests: 5,
    windowMs: 60 * 1000,
  }),

  /** Moderate rate limit for API endpoints: 60 requests per minute */
  api: createRateLimiter({
    maxRequests: 60,
    windowMs: 60 * 1000,
  }),

  /** Lenient rate limit for public endpoints: 120 requests per minute */
  public: createRateLimiter({
    maxRequests: 120,
    windowMs: 60 * 1000,
  }),

  /** Very strict for password reset: 3 requests per hour */
  passwordReset: createRateLimiter({
    maxRequests: 3,
    windowMs: 60 * 60 * 1000,
  }),
}

/**
 * Extract client IP from Next.js request
 *
 * @param request - Next.js request object
 * @returns Client IP address or 'unknown'
 */
export function getClientIp(request: Request): string {
  // Try various headers (depends on your proxy setup)
  const headers = new Headers(request.headers)
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }

  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // For Vercel
  const vercelIp = headers.get('x-vercel-forwarded-for')
  if (vercelIp) {
    return vercelIp.split(',')[0].trim()
  }

  return 'unknown'
}

/**
 * Cleanup function for tests or graceful shutdown
 */
export function stopCleanup() {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId)
    cleanupIntervalId = null
  }
}

/**
 * Clear all rate limit data (useful for testing)
 */
export function clearRateLimits() {
  rateLimitStore.clear()
}
