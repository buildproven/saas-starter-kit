import { checkEdgeRateLimit } from './edge-rate-limit'

export type RateLimitResponse = {
  allowed: boolean
  remaining: number
  resetAt: number
  retryAfter: number
}

/**
 * Shared rate-limit facade (Upstash Redis first, memory fallback).
 * Use in API routes to standardize behavior across projects.
 */
export async function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): Promise<RateLimitResponse> {
  const result = await checkEdgeRateLimit(key, limit, windowMs)
  return {
    allowed: !result.limited,
    remaining: result.remaining,
    resetAt: result.resetTime,
    retryAfter: result.retryAfter,
  }
}
