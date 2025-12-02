/**
 * Tests for Protected User API Routes
 */

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

jest.mock('@/lib/auth/api-protection', () => ({
  withUserAuth: (handler: (req: unknown, ctx: { user: unknown }) => unknown) => {
    return async (request: unknown) => {
      const mockUser = (request as { _mockUser?: unknown })._mockUser
      if (!mockUser) {
        return {
          json: async () => ({ error: 'Unauthorized' }),
          status: 401,
        }
      }
      return handler(request, { user: mockUser })
    }
  },
}))

import { GET, PUT } from './route'

describe('Protected User API', () => {
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
  }

  const createRequest = (body?: object, user?: unknown) => {
    return {
      json: jest.fn().mockResolvedValue(body || {}),
      _mockUser: user,
    } as unknown
  }

  describe('GET /api/protected/user', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest(undefined, null)
      const response = await GET(request as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns user data when authenticated', async () => {
      const request = createRequest(undefined, mockUser)
      const response = await GET(request as never)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user).toBeDefined()
      expect(data.user.id).toBe('user_123')
      expect(data.user.email).toBe('test@example.com')
      expect(data.message).toBe('User data retrieved successfully')
    })
  })

  describe('PUT /api/protected/user', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest({ name: 'New Name' }, null)
      const response = await PUT(request as never)
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 400 when name is missing', async () => {
      const request = createRequest({}, mockUser)
      const response = await PUT(request as never)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid name provided')
    })

    it('returns 400 when name is not a string', async () => {
      const request = createRequest({ name: 123 }, mockUser)
      const response = await PUT(request as never)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid name provided')
    })

    it('updates user name successfully', async () => {
      const request = createRequest({ name: 'Updated Name' }, mockUser)
      const response = await PUT(request as never)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.user.name).toBe('Updated Name')
      expect(data.message).toBe('User updated successfully')
    })
  })
})
