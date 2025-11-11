import { authOptions } from '@/lib/auth'
import { RateLimiters, getClientIp } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { NextRequest, NextResponse } from 'next/server'

// For NextAuth v4 with App Router compatibility
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NextAuth = require('next-auth').default
const nextAuthHandler = NextAuth(authOptions)

/**
 * Rate-limited wrapper for NextAuth handlers
 */
async function rateLimitedHandler(request: NextRequest) {
  const clientIp = getClientIp(request)
  const rateLimitResult = RateLimiters.auth(clientIp)

  if (!rateLimitResult.allowed) {
    logger.warn(
      {
        type: 'auth.rate_limit_exceeded',
        ip: clientIp,
        path: request.nextUrl.pathname,
        retryAfter: rateLimitResult.retryAfter,
      },
      'Authentication rate limit exceeded'
    )

    return NextResponse.json(
      {
        error: 'Too many authentication attempts',
        retryAfter: rateLimitResult.retryAfter,
      },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimitResult.retryAfter || 60),
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Remaining': String(rateLimitResult.remaining),
          'X-RateLimit-Reset': new Date(rateLimitResult.resetAt).toISOString(),
        },
      }
    )
  }

  // Add rate limit headers to successful responses
  const response = await nextAuthHandler(request)

  // Clone response to add headers
  const newResponse = new NextResponse(response.body, response)
  newResponse.headers.set('X-RateLimit-Limit', '5')
  newResponse.headers.set('X-RateLimit-Remaining', String(rateLimitResult.remaining))
  newResponse.headers.set('X-RateLimit-Reset', new Date(rateLimitResult.resetAt).toISOString())

  return newResponse
}

export const GET = rateLimitedHandler
export const POST = rateLimitedHandler
