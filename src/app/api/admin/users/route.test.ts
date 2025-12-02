/**
 * Tests for Admin Users API
 */

import { GET, POST } from './route'
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

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('GET /api/admin/users', () => {
  const createRequest = (params: Record<string, string> = {}): NextRequest => {
    const url = new URL('https://example.com/api/admin/users')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return { url: url.toString() } as unknown as NextRequest
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Authentication required')
  })

  it('returns 403 for non-admin users', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', role: 'USER' },
    })

    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Insufficient permissions')
  })

  it('returns users for admin users', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.users).toBeDefined()
    expect(json.pagination).toBeDefined()
    expect(json.message).toBe('Users retrieved successfully')

    consoleSpy.mockRestore()
  })

  it('handles pagination parameters', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
    const response = await GET(createRequest({ page: '2', limit: '5' }))
    const json = await response.json()

    expect(json.pagination.page).toBe(2)
    expect(json.pagination.limit).toBe(5)

    consoleSpy.mockRestore()
  })
})

describe('POST /api/admin/users', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Authentication required')
  })

  it('returns 400 when email is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const response = await POST(createRequest({ name: 'Test User' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Email and name are required')
  })

  it('returns 400 when name is missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const response = await POST(createRequest({ email: 'test@example.com' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Email and name are required')
  })

  it('returns 400 for invalid role', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const response = await POST(
      createRequest({
        email: 'test@example.com',
        name: 'Test User',
        role: 'INVALID_ROLE',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid role specified')
  })

  it('returns 403 when non-super-admin creates admin', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const response = await POST(
      createRequest({
        email: 'newadmin@example.com',
        name: 'New Admin',
        role: 'ADMIN',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toContain('Insufficient permissions')
  })

  it('allows super admin to create admin users', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'super_123', email: 'super@example.com', role: 'SUPER_ADMIN' },
    })

    const response = await POST(
      createRequest({
        email: 'newadmin@example.com',
        name: 'New Admin',
        role: 'ADMIN',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.user.role).toBe('ADMIN')
    expect(json.message).toBe('User created successfully')
  })

  it('creates regular user successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'admin_123', email: 'admin@example.com', role: 'ADMIN' },
    })

    const response = await POST(
      createRequest({
        email: 'newuser@example.com',
        name: 'New User',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.user.email).toBe('newuser@example.com')
    expect(json.user.role).toBe('USER')
  })
})
