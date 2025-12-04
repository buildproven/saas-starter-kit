/**
 * Tests for Projects API
 */

import { GET, POST } from './route'
import type { NextRequest } from 'next/server'

vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
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

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}))

vi.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    canPerformAction: vi.fn(),
    getPlanFeatures: vi.fn(),
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'

const mockGetServerSession = getServerSession as vi.MockedFunction<typeof getServerSession>
const mockPrismaOrgFindUnique = prisma.organization.findUnique as vi.Mock
const mockPrismaProjectFindMany = prisma.project.findMany as vi.Mock
const mockPrismaProjectCount = prisma.project.count as vi.Mock
const mockPrismaProjectCreate = prisma.project.create as vi.Mock
const mockCanPerformAction = SubscriptionService.canPerformAction as vi.Mock
const mockGetPlanFeatures = SubscriptionService.getPlanFeatures as vi.Mock

describe('GET /api/projects', () => {
  const createRequest = (params: Record<string, string> = {}): NextRequest => {
    const url = new URL('https://example.com/api/projects')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return { url: url.toString() } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns user projects with pagination', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaProjectFindMany.mockResolvedValueOnce([
      {
        id: 'proj_1',
        name: 'Test Project',
        organization: { id: 'org_1', name: 'Test Org', slug: 'test-org' },
      },
    ])
    mockPrismaProjectCount.mockResolvedValueOnce(1)

    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.projects).toHaveLength(1)
    expect(json.pagination.total).toBe(1)
    expect(json.pagination.page).toBe(1)
  })

  it('filters by organizationId', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaProjectFindMany.mockResolvedValueOnce([])
    mockPrismaProjectCount.mockResolvedValueOnce(0)

    await GET(createRequest({ organizationId: 'org_123' }))

    expect(mockPrismaProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org_123',
        }),
      })
    )
  })

  it('filters by status', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaProjectFindMany.mockResolvedValueOnce([])
    mockPrismaProjectCount.mockResolvedValueOnce(0)

    await GET(createRequest({ status: 'ACTIVE' }))

    expect(mockPrismaProjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
        }),
      })
    )
  })

  it('handles pagination parameters', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaProjectFindMany.mockResolvedValueOnce([])
    mockPrismaProjectCount.mockResolvedValueOnce(50)

    const response = await GET(createRequest({ page: '2', limit: '10' }))
    const json = await response.json()

    expect(json.pagination.page).toBe(2)
    expect(json.pagination.limit).toBe(10)
    expect(json.pagination.pages).toBe(5)
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaProjectFindMany.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation()
    const response = await GET(createRequest())
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})

describe('POST /api/projects', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
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

    const response = await POST(createRequest({ invalid: 'data' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 403 when user lacks access', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce(null)

    const response = await POST(
      createRequest({
        name: 'New Project',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 403 for viewer role', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [{ role: 'VIEWER' }],
    })

    const response = await POST(
      createRequest({
        name: 'New Project',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Insufficient permissions')
  })

  it('returns 402 when project limit reached', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockPrismaProjectCount.mockResolvedValueOnce(10)
    mockCanPerformAction.mockResolvedValueOnce(false)
    mockGetPlanFeatures.mockResolvedValueOnce({ maxProjects: 10 })

    const response = await POST(
      createRequest({
        name: 'New Project',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toContain('limit reached')
    expect(json.details.upgradeRequired).toBe(true)
  })

  it('creates project successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockPrismaProjectCount.mockResolvedValueOnce(5)
    mockCanPerformAction.mockResolvedValueOnce(true)
    mockPrismaProjectCreate.mockResolvedValueOnce({
      id: 'proj_new',
      name: 'New Project',
      organization: { id: 'org_123', name: 'Test Org', slug: 'test-org' },
    })

    const response = await POST(
      createRequest({
        name: 'New Project',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.project.name).toBe('New Project')
  })

  it('allows member role to create projects', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrgFindUnique.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [{ role: 'MEMBER' }],
    })
    mockPrismaProjectCount.mockResolvedValueOnce(0)
    mockCanPerformAction.mockResolvedValueOnce(true)
    mockPrismaProjectCreate.mockResolvedValueOnce({
      id: 'proj_new',
      name: 'New Project',
      organization: { id: 'org_123', name: 'Test Org', slug: 'test-org' },
    })

    const response = await POST(
      createRequest({
        name: 'New Project',
        organizationId: 'org_123',
      })
    )

    expect(response.status).toBe(201)
  })
})
