import { GET, POST, PUT } from './route'
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

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getSubscription: vi.fn(),
    getCurrentUsage: vi.fn(),
    checkLimits: vi.fn(),
    getPlanByPriceId: vi.fn(),
    createSubscription: vi.fn(),
    updateSubscription: vi.fn(),
  },
}))

import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'

const mockGetUser = vi.mocked(getUser)
const mockPrismaOrg = vi.mocked(prisma.organization.findUnique, true)
const mockPrismaOrgMany = vi.mocked(prisma.organization.findMany, true)
const mockPrismaSub = vi.mocked(prisma.subscription.findUnique, true)
const mockSubscriptionService = SubscriptionService as vi.Mocked<typeof SubscriptionService>

describe('GET /api/subscriptions', () => {
  const createGetRequest = (params: Record<string, string> = {}): NextRequest => {
    const url = new URL('https://example.com/api/subscriptions')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return { url: url.toString() } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

    const response = await GET(createGetRequest())
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns specific organization subscription', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as never)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      id: 'sub_123',
      status: 'ACTIVE',
    } as never)
    mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
      users: 5,
      projects: 3,
      apiKeys: 2,
      apiCallsThisPeriod: 1000,
      storageGB: 1,
    } as never)
    mockSubscriptionService.checkLimits.mockResolvedValueOnce({
      hasViolations: false,
      violations: [],
      usage: {},
      limits: {},
    } as never)

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.subscription.id).toBe('sub_123')
    expect(json.usage.users).toBe(5)
  })

  it('returns 403 when user lacks access to organization', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrg.mockResolvedValueOnce(null as never)

    const response = await GET(createGetRequest({ organizationId: 'org_other' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns all organization subscriptions when no orgId', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrgMany.mockResolvedValueOnce([
      {
        id: 'org_1',
        name: 'Org 1',
        slug: 'org-1',
        subscription: { id: 'sub_1', plan: { name: 'Pro' } },
      },
    ] as never)
    mockSubscriptionService.getCurrentUsage.mockResolvedValue({ users: 1 } as never)
    mockSubscriptionService.checkLimits.mockResolvedValue({ hasViolations: false } as never)

    const response = await GET(createGetRequest())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.subscriptions).toHaveLength(1)
    expect(json.total).toBe(1)
  })
})

describe('POST /api/subscriptions', () => {
  const createPostRequest = (body: Record<string, unknown>): NextRequest =>
    ({ json: vi.fn().mockResolvedValue(body) }) as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

    const response = await POST(createPostRequest({}))

    expect(response.status).toBe(401)
  })

  it('returns 400 for invalid input', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })

    const response = await POST(createPostRequest({ invalid: 'data' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 403 when user lacks owner/admin access', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [{ role: 'USER' }],
    } as never)

    const response = await POST(
      createPostRequest({
        organizationId: 'org_123',
        priceId: 'price_123',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        currentPeriodStart: '2024-01-01T00:00:00Z',
        currentPeriodEnd: '2024-02-01T00:00:00Z',
      })
    )

    expect(response.status).toBe(403)
  })

  it('returns 409 when subscription already exists', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as never)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      id: 'existing_sub',
    } as never)

    const response = await POST(
      createPostRequest({
        organizationId: 'org_123',
        priceId: 'price_123',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        currentPeriodStart: '2024-01-01T00:00:00Z',
        currentPeriodEnd: '2024-02-01T00:00:00Z',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('already has')
  })

  it('creates subscription successfully', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as never)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)
    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
    } as never)
    mockSubscriptionService.createSubscription.mockResolvedValueOnce({
      id: 'new_sub',
      status: 'ACTIVE',
    } as never)

    const response = await POST(
      createPostRequest({
        organizationId: 'org_123',
        priceId: 'price_123',
        customerId: 'cus_123',
        subscriptionId: 'sub_new',
        currentPeriodStart: '2024-01-01T00:00:00Z',
        currentPeriodEnd: '2024-02-01T00:00:00Z',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.message).toBe('Subscription created successfully')
  })
})

describe('PUT /api/subscriptions', () => {
  const createPutRequest = (
    params: Record<string, string>,
    body: Record<string, unknown>
  ): NextRequest => {
    const url = new URL('https://example.com/api/subscriptions')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return {
      url: url.toString(),
      json: vi.fn().mockResolvedValue(body),
    } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValueOnce(null)

    const response = await PUT(createPutRequest({}, {}))
    expect(response.status).toBe(401)
  })

  it('returns 400 when subscriptionId missing', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })

    const response = await PUT(createPutRequest({}, {}))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('Subscription ID')
  })

  it('returns 404 when subscription not found', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaSub.mockResolvedValueOnce(null as never)

    const response = await PUT(createPutRequest({ subscriptionId: 'sub_123' }, {}))

    expect(response.status).toBe(404)
  })

  it('updates subscription successfully', async () => {
    mockGetUser.mockResolvedValueOnce({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
    mockPrismaSub.mockResolvedValueOnce({
      subscriptionId: 'sub_123',
      organizationId: 'org_123',
      organization: { id: 'org_123' },
    } as never)
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as never)
    mockSubscriptionService.updateSubscription.mockResolvedValueOnce({
      subscriptionId: 'sub_123',
      status: 'PAST_DUE',
    } as never)

    const response = await PUT(
      createPutRequest({ subscriptionId: 'sub_123' }, { status: 'PAST_DUE' })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.message).toBe('Subscription updated successfully')
  })
})
