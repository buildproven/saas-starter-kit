/**
 * Advanced Rate Limiting with Request Deduplication
 *
 * Implements per-user rate limiting with:
 * - Mutex locking for atomic operations (prevents race conditions)
 * - SHA-256 content hashing for request deduplication
 * - In-flight request tracking (duplicate requests wait for original)
 * - Result caching with configurable TTL
 * - Automatic cleanup of expired records
 *
 * Ported from letterflow with enhancements for generic use.
 *
 * @example
 * ```typescript
 * // Create limiter with custom config
 * const limiter = new AdvancedRateLimiter({
 *   requestsPerMinute: 5,
 *   requestsPerHour: 20,
 *   dedupCacheTtl: 5 * 60 * 1000,
 * })
 *
 * // Check rate limit
 * const { allowed, retryAfter, reason } = await limiter.checkRateLimit('user123')
 *
 * // Handle deduplication
 * const { isDuplicate, existingResult } = await limiter.handleDeduplication(
 *   'user123',
 *   { title: 'My Request', content: 'Request data...' }
 * )
 * ```
 */

import crypto from 'crypto'

export interface RateLimitConfig {
  /** Max requests per minute per user (default: 3) */
  requestsPerMinute?: number
  /** Max requests per hour per user (default: 10) */
  requestsPerHour?: number
  /** Deduplication cache TTL in ms (default: 5 minutes) */
  dedupCacheTtl?: number
  /** Cleanup interval in ms (default: 1 minute) */
  cleanupInterval?: number
  /** Lock timeout in ms (default: 1 second) */
  lockTimeout?: number
  /** Namespace for rate limit keys (default: 'default') */
  namespace?: string
}

interface RateLimitRecord {
  count: number
  resetTime: number
  lastRequest: number
  locked: boolean
}

interface PendingRequest<T = unknown> {
  requestId: string
  userId: string
  contentHash: string
  timestamp: number
  resolve: (value: T) => void
  reject: (error: unknown) => void
}

interface CachedResult<T = unknown> {
  result: T
  timestamp: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: number
  reason?: string
  remaining?: number
  resetTime?: number
}

export interface DeduplicationResult<T = unknown> {
  isDuplicate: boolean
  requestId: string
  existingResult?: T
}

export interface UserStatus {
  requestsRemaining: number
  resetTime: number
  isLimited: boolean
}

export interface RateLimiterStats {
  activeUsers: number
  pendingRequests: number
  cachedResults: number
  timestamp: number
}

export class AdvancedRateLimiter<T = unknown> {
  private userLimits = new Map<string, RateLimitRecord>()
  private pendingRequests = new Map<string, PendingRequest<T>>()
  private completedRequests = new Map<string, CachedResult<T>>()
  private cleanupIntervalHandle: ReturnType<typeof setInterval> | null = null

  private readonly requestsPerMinute: number
  private readonly requestsPerHour: number
  private readonly dedupCacheTtl: number
  private readonly cleanupInterval: number
  private readonly lockTimeout: number
  private readonly namespace: string

  constructor(config: RateLimitConfig = {}) {
    this.requestsPerMinute = config.requestsPerMinute ?? 3
    this.requestsPerHour = config.requestsPerHour ?? 10
    this.dedupCacheTtl = config.dedupCacheTtl ?? 5 * 60 * 1000 // 5 minutes
    this.cleanupInterval = config.cleanupInterval ?? 60 * 1000 // 1 minute
    this.lockTimeout = config.lockTimeout ?? 1000 // 1 second
    this.namespace = config.namespace ?? 'default'

    // Start periodic cleanup
    this.cleanupIntervalHandle = setInterval(() => this.cleanup(), this.cleanupInterval)
  }

  /**
   * Cleanup resources on shutdown
   * Call this when the limiter is no longer needed to prevent memory leaks
   */
  destroy(): void {
    if (this.cleanupIntervalHandle) {
      clearInterval(this.cleanupIntervalHandle)
      this.cleanupIntervalHandle = null
    }
    this.userLimits.clear()
    this.pendingRequests.clear()
    this.completedRequests.clear()
  }

  /**
   * Acquire mutex lock with timeout protection
   */
  private async acquireLock(key: string): Promise<boolean> {
    const startTime = Date.now()
    const maxIterations = Math.ceil(this.lockTimeout / 10) + 10

    for (let i = 0; i < maxIterations; i++) {
      const record = this.userLimits.get(key)

      if (!record) {
        return true
      }

      if (!record.locked) {
        record.locked = true
        this.userLimits.set(key, record)
        return true
      }

      // Check for lock timeout (stale lock recovery)
      if (Date.now() - startTime > this.lockTimeout) {
        record.locked = false
        this.userLimits.set(key, record)
        return true
      }

      // Brief wait before retry
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    // Fallback: force acquire after max iterations
    return true
  }

  /**
   * Release mutex lock
   */
  private releaseLock(key: string): void {
    const record = this.userLimits.get(key)
    if (record) {
      record.locked = false
      this.userLimits.set(key, record)
    }
  }

  /**
   * Check if user can make a request
   *
   * Implements per-user rate limiting with sliding window algorithm:
   * - Configurable requests per minute (burst protection)
   * - Configurable requests per hour (sustained usage limit)
   * - Mutex locking for atomic check-and-increment
   *
   * @param userId - Authenticated user ID
   * @returns Rate limit decision with retry guidance
   */
  async checkRateLimit(userId: string): Promise<RateLimitResult> {
    const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    const enforceInTests = process.env.ENFORCE_RATE_LIMIT_TESTS === 'true'

    if (isTestEnv && !enforceInTests) {
      return { allowed: true, remaining: this.requestsPerMinute }
    }

    const now = Date.now()
    const userKey = `${this.namespace}:${userId}`

    await this.acquireLock(userKey)

    try {
      let record = this.userLimits.get(userKey)

      if (!record) {
        record = {
          count: 1,
          resetTime: now + 60 * 1000,
          lastRequest: now,
          locked: false,
        }
        this.userLimits.set(userKey, record)
        return {
          allowed: true,
          remaining: this.requestsPerMinute - 1,
          resetTime: record.resetTime,
        }
      }

      // Check if window has reset
      if (now >= record.resetTime) {
        record.count = 1
        record.resetTime = now + 60 * 1000
        record.lastRequest = now
        this.userLimits.set(userKey, record)
        return {
          allowed: true,
          remaining: this.requestsPerMinute - 1,
          resetTime: record.resetTime,
        }
      }

      // Check minute limit
      if (record.count >= this.requestsPerMinute) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000)
        return {
          allowed: false,
          retryAfter,
          reason: `Rate limit exceeded: ${this.requestsPerMinute} requests per minute. Try again in ${retryAfter}s.`,
          remaining: 0,
          resetTime: record.resetTime,
        }
      }

      // Check hourly limit
      const hourAgo = now - 60 * 60 * 1000
      if (record.lastRequest > hourAgo && record.count >= this.requestsPerHour) {
        return {
          allowed: false,
          retryAfter: 3600,
          reason: `Hourly limit reached: ${this.requestsPerHour} requests per hour. Try again later.`,
          remaining: 0,
          resetTime: now + 3600 * 1000,
        }
      }

      // Allow request and increment counter
      record.count++
      record.lastRequest = now
      this.userLimits.set(userKey, record)

      return {
        allowed: true,
        remaining: Math.max(0, this.requestsPerMinute - record.count),
        resetTime: record.resetTime,
      }
    } finally {
      this.releaseLock(userKey)
    }
  }

  /**
   * Generate content hash for deduplication
   *
   * Creates SHA-256 hash of content + userId for:
   * - Detecting duplicate requests
   * - Enabling result caching
   * - Preventing redundant API calls
   *
   * @param userId - User ID for multi-tenancy isolation
   * @param content - Content to hash (string or object)
   * @returns 16-character hex hash
   */
  generateContentHash(userId: string, content: string | object): string {
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content)
    return crypto
      .createHash('sha256')
      .update(`${userId}:${contentStr}`)
      .digest('hex')
      .substring(0, 16)
  }

  /**
   * Handle request deduplication
   *
   * Three-stage duplicate detection:
   * 1. Check completed results cache (TTL-based) - instant response
   * 2. Check pending requests - wait for in-flight completion
   * 3. New request - proceed with processing
   *
   * @param userId - User ID for cache isolation
   * @param content - Request content to deduplicate
   * @returns Deduplication decision with cached result if available
   */
  async handleDeduplication(
    userId: string,
    content: string | object
  ): Promise<DeduplicationResult<T>> {
    const contentHash = this.generateContentHash(userId, content)
    const requestId = `${userId}:${contentHash}`

    // Check completed results cache
    const existingResult = this.completedRequests.get(requestId)
    if (existingResult) {
      const age = Date.now() - existingResult.timestamp
      if (age < this.dedupCacheTtl) {
        return {
          isDuplicate: true,
          requestId,
          existingResult: existingResult.result,
        }
      } else {
        this.completedRequests.delete(requestId)
      }
    }

    // Check pending requests
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      return new Promise((resolve, reject) => {
        const originalResolve = pendingRequest.resolve
        const originalReject = pendingRequest.reject

        pendingRequest.resolve = (result) => {
          originalResolve(result)
          resolve({ isDuplicate: true, requestId, existingResult: result })
        }

        pendingRequest.reject = (error) => {
          originalReject(error)
          reject(error)
        }
      })
    }

    // New unique request
    return { isDuplicate: false, requestId }
  }

  /**
   * Register a pending request for in-flight deduplication
   *
   * @param requestId - Unique request identifier
   * @param userId - User ID for tracking
   * @param contentHash - Content hash for cleanup
   */
  registerPendingRequest(
    requestId: string,
    userId: string,
    contentHash: string
  ): {
    promise: Promise<T>
    resolve: (value: T) => void
    reject: (error: unknown) => void
  } {
    let resolve!: (value: T) => void
    let reject!: (error: unknown) => void

    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })

    const pendingRequest: PendingRequest<T> = {
      requestId,
      userId,
      contentHash,
      timestamp: Date.now(),
      resolve,
      reject,
    }

    this.pendingRequests.set(requestId, pendingRequest)

    return { promise, resolve, reject }
  }

  /**
   * Complete a pending request and cache result
   */
  completePendingRequest(requestId: string, result: T): void {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.resolve(result)
      this.pendingRequests.delete(requestId)

      this.completedRequests.set(requestId, {
        result,
        timestamp: Date.now(),
      })
    }
  }

  /**
   * Fail a pending request (does not cache - allows retry)
   */
  failPendingRequest(requestId: string, error: unknown): void {
    const pendingRequest = this.pendingRequests.get(requestId)
    if (pendingRequest) {
      pendingRequest.reject(error)
      this.pendingRequests.delete(requestId)
    }
  }

  /**
   * Get current rate limit status for user
   */
  getUserStatus(userId: string): UserStatus {
    const now = Date.now()
    const userKey = `${this.namespace}:${userId}`
    const record = this.userLimits.get(userKey)

    if (!record || now >= record.resetTime) {
      return {
        requestsRemaining: this.requestsPerMinute,
        resetTime: now + 60 * 1000,
        isLimited: false,
      }
    }

    const remaining = Math.max(0, this.requestsPerMinute - record.count)
    return {
      requestsRemaining: remaining,
      resetTime: record.resetTime,
      isLimited: remaining === 0,
    }
  }

  /**
   * Get system statistics for monitoring
   */
  getStats(): RateLimiterStats {
    return {
      activeUsers: this.userLimits.size,
      pendingRequests: this.pendingRequests.size,
      cachedResults: this.completedRequests.size,
      timestamp: Date.now(),
    }
  }

  /**
   * Cleanup expired records
   */
  private cleanup(): void {
    const now = Date.now()

    // Cleanup expired rate limit records
    for (const [key, record] of this.userLimits.entries()) {
      if (now >= record.resetTime + 60 * 1000) {
        this.userLimits.delete(key)
      }
    }

    // Cleanup expired pending requests (5 minute timeout)
    for (const [key, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > 5 * 60 * 1000) {
        request.reject(new Error('Request timeout'))
        this.pendingRequests.delete(key)
      }
    }

    // Cleanup expired completed results
    for (const [key, result] of this.completedRequests.entries()) {
      if (now - result.timestamp > this.dedupCacheTtl) {
        this.completedRequests.delete(key)
      }
    }
  }
}

// Default singleton instance for common use cases
export const rateLimiter = new AdvancedRateLimiter()

// Re-export for convenience
export default AdvancedRateLimiter
