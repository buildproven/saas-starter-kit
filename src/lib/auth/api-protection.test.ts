/**
 * Tests for API Protection utilities
 */

import type { NextRequest } from 'next/server'

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        json: async () => data,
        status: init?.status ?? 200,
      }),
    },
  }
})

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

import { getServerSession } from 'next-auth/next'
import {
  withAuth,
  withUserAuth,
  withAdminAuth,
  withSuperAdminAuth,
  canUserAccess,
  rateLimit,
  corsHeaders,
} from './api-protection'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('API Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('withAuth', () => {
    const mockHandler = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      status: 200,
    })

    const createRequest = (): NextRequest =>
      ({
        headers: new Headers(),
      }) as unknown as NextRequest

    it('returns 401 when not authenticated and auth required', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const protectedHandler = withAuth(mockHandler)
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Authentication required')
      expect(mockHandler).not.toHaveBeenCalled()
    })

    it('allows unauthenticated access when allowUnauthenticated is true', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const protectedHandler = withAuth(mockHandler, { allowUnauthenticated: true })
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ user: null })
      )
    })

    it('extracts user data from session', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'ADMIN',
        },
      })

      const protectedHandler = withAuth(mockHandler)
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          user: {
            id: 'user_123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'ADMIN',
          },
        })
      )
    })

    it('defaults to USER role when not specified', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: 'user_123',
          email: 'test@example.com',
        },
      })

      const protectedHandler = withAuth(mockHandler)
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          user: expect.objectContaining({
            role: 'USER',
          }),
        })
      )
    })

    it('returns 403 when user lacks required role', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: 'user_123',
          email: 'test@example.com',
          role: 'USER',
        },
      })

      const protectedHandler = withAuth(mockHandler, { requiredRole: 'ADMIN' })
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Insufficient permissions')
    })

    it('allows access when user has higher role', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: 'user_123',
          email: 'test@example.com',
          role: 'SUPER_ADMIN',
        },
      })

      const protectedHandler = withAuth(mockHandler, { requiredRole: 'ADMIN' })
      await protectedHandler(createRequest())

      expect(mockHandler).toHaveBeenCalled()
    })

    it('handles errors gracefully', async () => {
      mockGetServerSession.mockRejectedValueOnce(new Error('Session error'))

      const errorSpy = jest.spyOn(console, 'error').mockImplementation()
      const protectedHandler = withAuth(mockHandler)
      const response = await protectedHandler(createRequest())
      const json = await response.json()

      expect(response.status).toBe(500)
      expect(json.error).toBe('Internal server error')
      errorSpy.mockRestore()
    })
  })

  describe('convenience auth functions', () => {
    const mockHandler = jest.fn().mockResolvedValue({
      json: async () => ({ success: true }),
      status: 200,
    })

    const createRequest = (): NextRequest =>
      ({
        headers: new Headers(),
      }) as unknown as NextRequest

    it('withUserAuth requires USER role', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_123', email: 'test@example.com', role: 'USER' },
      })

      const handler = withUserAuth(mockHandler)
      await handler(createRequest())

      expect(mockHandler).toHaveBeenCalled()
    })

    it('withAdminAuth requires ADMIN role', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_123', email: 'test@example.com', role: 'USER' },
      })

      const handler = withAdminAuth(mockHandler)
      const response = await handler(createRequest())

      expect(response.status).toBe(403)
    })

    it('withSuperAdminAuth requires SUPER_ADMIN role', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_123', email: 'test@example.com', role: 'ADMIN' },
      })

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
