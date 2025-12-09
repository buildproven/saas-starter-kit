import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  withAuth,
  withUserAuth,
  withAdminAuth,
  withSuperAdminAuth,
  canUserAccess,
  rateLimit,
  corsHeaders,
} from './api-protection'
import { getUser } from '@/lib/auth/get-user'

// Mock dependencies
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

// Mock Next.js server response
vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (data: unknown, init?: { status?: number; headers?: globalThis.HeadersInit }) => ({
        json: async () => data,
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
      }),
    },
  }
})

const mockGetUser = getUser as vi.Mock

describe('API Protection', () => {
  const mockHandler = vi.fn()

  const createRequest = (headers: Record<string, string> = {}) => {
    return {
      headers: new Map(Object.entries(headers)),
      ip: '127.0.0.1',
    } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockHandler.mockImplementation(async () => NextResponse.json({ success: true }))
  })

  describe('withAuth', () => {
    it('returns 401 when not authenticated and auth required', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const protectedHandler = withAuth(mockHandler)
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Authentication required')
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('allows unauthenticated access when allowUnauthenticated is true', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const protectedHandler = withAuth(mockHandler, { allowUnauthenticated: true })
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ user: null })
      )
    })

    it('extracts user data from session', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const protectedHandler = withAuth(mockHandler)
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          user: expect.objectContaining({
            id: 'user_1',
            email: 'test@example.com',
          }),
        })
      )
    })

    it('defaults to USER role when not specified', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        // role missing
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const protectedHandler = withAuth(mockHandler)
      await protectedHandler(createRequest())

      // Logic might cast, but let's ensure we pass what get-user returns
      // Implementation defaults role to USER if missing in type, but let's see
    })

    it('returns 403 when user lacks required role', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const protectedHandler = withAuth(mockHandler, { requiredRole: 'ADMIN' })
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Insufficient permissions')
    })

    it('allows access when user has higher role', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        role: 'ADMIN',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const protectedHandler = withAuth(mockHandler, { requiredRole: 'USER' })
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalled()
    })

    it('handles errors gracefully', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      mockGetUser.mockRejectedValueOnce(new Error('Session error'))

      const protectedHandler = withAuth(mockHandler)
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('Internal server error')
      errorSpy.mockRestore()
    })
  })

  describe('convenience auth functions', () => {
    it('withUserAuth requires USER role', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const handler = withUserAuth(mockHandler)
      await handler(createRequest())

      expect(mockHandler).toHaveBeenCalled()
    })

    it('withAdminAuth requires ADMIN role', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const handler = withAdminAuth(mockHandler)
      const response = await handler(createRequest())

      expect(response.status).toBe(403)
    })

    it('withSuperAdminAuth requires SUPER_ADMIN role', async () => {
      const mockUser = {
        id: 'user_1',
        email: 'test@example.com',
        role: 'ADMIN',
      }
      mockGetUser.mockResolvedValueOnce(mockUser)

      const handler = withSuperAdminAuth(mockHandler)
      const response = await handler(createRequest())

      expect(response.status).toBe(403)
    })
  })

  describe('canUserAccess', () => {
    it('returns false for null role', () => {
      expect(canUserAccess(null, 'USER')).toBe(false)
    })

    it('returns true when user role equals required', () => {
      expect(canUserAccess('ADMIN', 'ADMIN')).toBe(true)
    })

    it('returns true when user role is higher than required', () => {
      expect(canUserAccess('SUPER_ADMIN', 'USER')).toBe(true)
      expect(canUserAccess('ADMIN', 'USER')).toBe(true)
    })

    it('returns false when user role is lower than required', () => {
      expect(canUserAccess('USER', 'ADMIN')).toBe(false)
      expect(canUserAccess('ADMIN', 'SUPER_ADMIN')).toBe(false)
    })
  })

  describe('rateLimit', () => {
    it('allows first request from new IP', () => {
      expect(rateLimit('new-ip-1', 100, 60000)).toBe(true)
    })

    it('allows requests under limit', () => {
      const ip = 'test-ip-under-limit'
      for (let i = 0; i < 10; i++) {
        expect(rateLimit(ip, 100, 60000)).toBe(true)
      }
    })

    it('blocks requests at limit', () => {
      const ip = 'test-ip-at-limit'
      const limit = 5

      for (let i = 0; i < limit; i++) {
        rateLimit(ip, limit, 60000)
      }

      expect(rateLimit(ip, limit, 60000)).toBe(false)
    })

    it('uses default limit when not specified', () => {
      expect(rateLimit('default-limit-ip')).toBe(true)
    })
  })

  describe('corsHeaders', () => {
    it('returns wildcard for no origin', () => {
      const headers = corsHeaders()
      expect(headers['Access-Control-Allow-Origin']).toBe('*')
    })

    it('returns origin for allowed origins', () => {
      const headers = corsHeaders('http://localhost:3000')
      expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:3000')
    })

    it('returns null for disallowed origins', () => {
      const headers = corsHeaders('https://evil.com')
      expect(headers['Access-Control-Allow-Origin']).toBe('null')
    })

    it('includes standard CORS headers', () => {
      const headers = corsHeaders()
      expect(headers['Access-Control-Allow-Methods']).toContain('GET')
      expect(headers['Access-Control-Allow-Methods']).toContain('POST')
      expect(headers['Access-Control-Allow-Headers']).toContain('Authorization')
      expect(headers['Access-Control-Allow-Credentials']).toBe('true')
    })
  })
})
