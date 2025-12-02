/**
 * Tests for Organizations API
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

jest.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrismaOrgFindMany = prisma.organization.findMany as jest.Mock
const mockPrismaOrgFindUnique = prisma.organization.findUnique as jest.Mock
const mockPrismaOrgCreate = prisma.organization.create as jest.Mock

describe('GET /api/organizations', () => {
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

  it('returns user organizations', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindMany.mockResolvedValueOnce([
      {
        id: 'org_1',
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'user_123',
        owner: { id: 'user_123', name: 'Test User', email: 'test@example.com' },
        members: [],
        subscription: null,
        _count: { members: 1, projects: 2, apiKeys: 3 },
      },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.organizations).toHaveLength(1)
    expect(json.organizations[0].name).toBe('Test Org')
    expect(json.organizations[0].userRole).toBe('OWNER')
    expect(json.total).toBe(1)
  })

  it('sets userRole to member role for non-owners', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindMany.mockResolvedValueOnce([
      {
        id: 'org_1',
        name: 'Other Org',
        slug: 'other-org',
        ownerId: 'other_user',
        owner: { id: 'other_user', name: 'Other User', email: 'other@example.com' },
        members: [{ role: 'ADMIN', status: 'ACTIVE', joinedAt: new Date() }],
        subscription: null,
        _count: { members: 5, projects: 10, apiKeys: 2 },
      },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.organizations[0].userRole).toBe('ADMIN')
    expect(json.organizations[0].userStatus).toBe('ACTIVE')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindMany.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})

describe('POST /api/organizations', () => {
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
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid input', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })

    const response = await POST(createRequest({ name: '', slug: 'INVALID_SLUG!' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
    expect(json.details).toBeDefined()
  })

  it('returns 409 when slug already exists', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce({ id: 'existing_org' })

    const response = await POST(
      createRequest({
        name: 'New Org',
        slug: 'existing-slug',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('already exists')
  })

  it('creates organization successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce(null)
    mockPrismaOrgCreate.mockResolvedValueOnce({
      id: 'new_org',
      name: 'New Organization',
      slug: 'new-org',
      ownerId: 'user_123',
      owner: { id: 'user_123', name: 'Test User', email: 'test@example.com' },
      _count: { members: 0, projects: 0, apiKeys: 0 },
    })

    const response = await POST(
      createRequest({
        name: 'New Organization',
        slug: 'new-org',
        description: 'A new organization',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.organization.name).toBe('New Organization')
    expect(json.organization.userRole).toBe('OWNER')
    expect(json.organization.userStatus).toBe('ACTIVE')
  })

  it('validates slug format', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })

    const response = await POST(
      createRequest({
        name: 'Test Org',
        slug: 'Invalid Slug With Spaces',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce(null)
    mockPrismaOrgCreate.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await POST(
      createRequest({
        name: 'New Org',
        slug: 'new-org',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})
