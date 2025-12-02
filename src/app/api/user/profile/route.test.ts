/**
 * Tests for User Profile API
 */

import { GET, PUT, DELETE } from './route'
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

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    organization: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    organizationMember: {
      deleteMany: jest.fn(),
    },
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrismaUserFindUnique = prisma.user.findUnique as jest.Mock
const mockPrismaUserFindFirst = prisma.user.findFirst as jest.Mock
const mockPrismaUserUpdate = prisma.user.update as jest.Mock
const mockPrismaUserDelete = prisma.user.delete as jest.Mock
const mockPrismaOrgFindMany = prisma.organization.findMany as jest.Mock
const mockPrismaOrgCount = prisma.organization.count as jest.Mock
const mockPrismaMemberDeleteMany = prisma.organizationMember.deleteMany as jest.Mock

describe('GET /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 404 when user not found', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce(null)

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('User not found')
  })

  it('returns user profile with organizations', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({
      id: 'user_123',
      name: 'Test User',
      email: 'test@example.com',
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      emailVerified: new Date(),
      _count: { ownedOrganizations: 1, organizationMemberships: 2 },
    })
    mockPrismaOrgFindMany.mockResolvedValueOnce([
      {
        id: 'org_1',
        name: 'Owned Org',
        slug: 'owned-org',
        ownerId: 'user_123',
        members: [],
      },
      {
        id: 'org_2',
        name: 'Member Org',
        slug: 'member-org',
        ownerId: 'other_user',
        members: [{ role: 'ADMIN', status: 'ACTIVE' }],
      },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.user.name).toBe('Test User')
    expect(json.user.organizations).toHaveLength(2)
    expect(json.user.organizations[0].userRole).toBe('OWNER')
    expect(json.user.organizations[1].userRole).toBe('ADMIN')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})

describe('PUT /api/user/profile', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await PUT(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid input', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })

    const response = await PUT(createRequest({ email: 'invalid-email' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 409 when email already in use', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindFirst.mockResolvedValueOnce({ id: 'other_user' })

    const response = await PUT(createRequest({ email: 'taken@example.com' }))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('already in use')
  })

  it('updates profile successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserUpdate.mockResolvedValueOnce({
      id: 'user_123',
      name: 'Updated Name',
      email: 'test@example.com',
      image: null,
      updatedAt: new Date(),
      emailVerified: new Date(),
    })

    const response = await PUT(createRequest({ name: 'Updated Name' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.user.name).toBe('Updated Name')
    expect(json.message).toBe('Profile updated successfully')
  })

  it('resets email verification when email changes', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindFirst.mockResolvedValueOnce(null)
    mockPrismaUserUpdate.mockResolvedValueOnce({
      id: 'user_123',
      name: 'Test User',
      email: 'new@example.com',
      image: null,
      updatedAt: new Date(),
      emailVerified: null,
    })

    const response = await PUT(createRequest({ email: 'new@example.com' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.message).toContain('verify your new email')
  })
})

describe('DELETE /api/user/profile', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await DELETE(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 409 when user owns organizations', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgCount.mockResolvedValueOnce(2)

    const response = await DELETE(createRequest({ confirmDelete: true }))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('owning organizations')
    expect(json.ownedOrganizations).toBe(2)
  })

  it('returns 400 without confirmation', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgCount.mockResolvedValueOnce(0)

    const response = await DELETE(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('explicit confirmation')
  })

  it('deletes account with confirmation', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgCount.mockResolvedValueOnce(0)
    mockPrismaMemberDeleteMany.mockResolvedValueOnce({ count: 3 })
    mockPrismaUserDelete.mockResolvedValueOnce({ id: 'user_123' })

    const response = await DELETE(createRequest({ confirmDelete: true }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.message).toBe('Account deleted successfully')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgCount.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await DELETE(createRequest({ confirmDelete: true }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})
