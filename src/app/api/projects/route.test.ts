/**
 * Tests for Projects API
 */

import { GET, POST } from './route'
import type { NextRequest } from 'next/server'
import { vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  prismaOrgFindUniqueMock: vi.fn(),
  prismaOrgFindFirstMock: vi.fn(),
  prismaProjectFindManyMock: vi.fn(),
  prismaProjectCountMock: vi.fn(),
  prismaProjectCreateMock: vi.fn(),
  mockCanPerformAction: vi.fn(),
  mockGetPlanFeatures: vi.fn(),
}))

const {
  mockGetUser,
  prismaOrgFindUniqueMock,
  prismaOrgFindFirstMock,
  prismaProjectFindManyMock,
  prismaProjectCountMock,
  prismaProjectCreateMock,
  mockCanPerformAction,
  mockGetPlanFeatures,
} = mocks

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, init?: { status?: number; headers?: globalThis.HeadersInit }) => ({
      json: async () => data,
      status: init?.status ?? 200,
      headers: new Headers(init?.headers),
    })),
  },
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: mocks.mockGetUser,
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: mocks.prismaOrgFindUniqueMock,
      findFirst: mocks.prismaOrgFindFirstMock,
    },
    project: {
      findMany: mocks.prismaProjectFindManyMock,
      count: mocks.prismaProjectCountMock,
      create: mocks.prismaProjectCreateMock,
    },
  },
}))

vi.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    canPerformAction: mocks.mockCanPerformAction,
    getPlanFeatures: mocks.mockGetPlanFeatures,
  },
}))

const createRequest = (
  method: 'GET' | 'POST',
  params: Record<string, string> | Record<string, unknown> = {},
  body: Record<string, unknown> | null = null
): NextRequest => {
  const url = new URL('https://example.com/api/projects')

  // Populate search params for GET requests
  if (method === 'GET') {
    Object.entries(params as Record<string, string>).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  // Create a mock NextRequest object with a URL and a json method
  const mockRequest = {
    url: url.toString(),
    method: method,
    headers: new Headers(),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as NextRequest

  return mockRequest
}

describe('GET /api/projects', () => {
  beforeEach(() => {
    // Removed async
    vi.clearAllMocks()

    // Reset all mocks
    mockGetUser.mockReset()
    prismaOrgFindUniqueMock.mockReset()
    prismaOrgFindFirstMock.mockReset()
    prismaProjectFindManyMock.mockReset()
    prismaProjectCountMock.mockReset()
    prismaProjectCreateMock.mockReset()
    mockCanPerformAction.mockReset()
    mockGetPlanFeatures.mockReset()

    // Default authenticated user session for mockGetUser
    mockGetUser.mockResolvedValue({
      id: 'user_123',
      role: 'USER',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
    })
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

    const response = await GET(createRequest('GET'))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns user projects with pagination', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaProjectFindManyMock.mockResolvedValueOnce([
      {
        id: 'proj_1',
        name: 'Test Project',
        organization: { id: 'org_1', name: 'Test Org', slug: 'test-org' },
      },
    ])
    prismaProjectCountMock.mockResolvedValueOnce(1)

    const response = await GET(createRequest('GET'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.projects).toHaveLength(1)
    expect(json.pagination.total).toBe(1)
    expect(json.pagination.page).toBe(1)
  })

  it('filters by organizationId', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaProjectFindManyMock.mockResolvedValueOnce([])
    prismaProjectCountMock.mockResolvedValueOnce(0)

    await GET(createRequest('GET', { organizationId: 'org_123' }))

    expect(prismaProjectFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org_123',
        }),
      })
    )
  })

  it('filters by status', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaProjectFindManyMock.mockResolvedValueOnce([])
    prismaProjectCountMock.mockResolvedValueOnce(0)

    await GET(createRequest('GET', { status: 'ACTIVE' }))

    expect(prismaProjectFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'ACTIVE',
        }),
      })
    )
  })

  it('handles pagination parameters', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaProjectFindManyMock.mockResolvedValueOnce([])
    prismaProjectCountMock.mockResolvedValueOnce(50)

    const response = await GET(createRequest('GET', { page: '2', limit: '10' }))
    const json = await response.json()

    expect(json.pagination.page).toBe(2)
    expect(json.pagination.limit).toBe(10)
    expect(json.pagination.pages).toBe(5)
  })

  it('handles internal errors', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaProjectFindManyMock.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await GET(createRequest('GET'))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})

describe('POST /api/projects', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Reset all mocks
    mockGetUser.mockReset()
    prismaOrgFindUniqueMock.mockReset()
    prismaOrgFindFirstMock.mockReset()
    prismaProjectFindManyMock.mockReset()
    prismaProjectCountMock.mockReset()
    prismaProjectCreateMock.mockReset()
    mockCanPerformAction.mockReset()
    mockGetPlanFeatures.mockReset()

    // Default authenticated user session for mockGetUser
    mockGetUser.mockResolvedValue({
      id: 'user_123',
      role: 'USER',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
    })
    mockCanPerformAction.mockResolvedValue(true) // Default to allow
    mockGetPlanFeatures.mockResolvedValue({ maxProjects: 10 }) // Default features
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

    const response = await POST(createRequest('POST', {}, {}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid input', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })

    const response = await POST(createRequest('POST', {}, { invalid: 'data' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 403 when user lacks access', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    const response = await POST(
      createRequest(
        'POST',
        {},
        {
          name: 'New Project',
          organizationId: 'org_123',
        }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 403 for viewer role', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaOrgFindUniqueMock.mockResolvedValueOnce({
      id: 'org_123',
      members: [{ role: 'VIEWER' }],
    })

    const response = await POST(
      createRequest(
        'POST',
        {},
        {
          name: 'New Project',
          organizationId: 'org_123',
        }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Insufficient permissions')
  })

  it('returns 402 when project limit reached', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaOrgFindUniqueMock.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [{ role: 'ADMIN' }],
      subscription: {
        status: 'ACTIVE',
        plan: {
          features: { maxProjects: 1 },
        },
      },
    })
    mockCanPerformAction.mockResolvedValueOnce(false)
    mockGetPlanFeatures.mockResolvedValueOnce({ maxProjects: 1 })
    const response = await POST(
      createRequest(
        'POST',
        {},
        {
          name: 'New Project',
          organizationId: 'org_123',
        }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(402)
    expect(json.error).toContain('limit reached')
    expect(json.details.upgradeRequired).toBe(true)
  })

  it('creates project successfully', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaOrgFindUniqueMock.mockResolvedValueOnce({
      id: 'org_123',
      members: [{ role: 'ADMIN' }],
      subscription: null,
      projects: [],
    })
    mockCanPerformAction.mockResolvedValueOnce(true)
    prismaProjectCreateMock.mockResolvedValueOnce({
      id: 'p_new',
      name: 'New Project',
      organizationId: 'org_123',
    })

    const response = await POST(
      createRequest(
        'POST',
        {},
        {
          name: 'New Project',
          organizationId: 'org_123',
        }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.project.name).toBe('New Project')
  })

  it('allows member role to create projects', async () => {
    mockGetUser.mockResolvedValueOnce({ id: 'user_123' })
    prismaOrgFindUniqueMock.mockResolvedValueOnce({
      id: 'org_123',
      members: [{ role: 'MEMBER' }],
      subscription: null,
      projects: [],
    })
    mockCanPerformAction.mockResolvedValueOnce(true)
    prismaProjectCreateMock.mockResolvedValueOnce({
      id: 'p_new',
      name: 'New Project',
    })

    const response = await POST(
      createRequest(
        'POST',
        {},
        {
          name: 'New Project',
          organizationId: 'org_123',
        }
      )
    )

    expect(response.status).toBe(201)
  })
})
