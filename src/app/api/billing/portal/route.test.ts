import { POST, GET } from './route'
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
      redirect: (url: string) => ({
        type: 'redirect',
        url,
        status: 307,
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
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('@/lib/billing', () => ({
  BillingService: {
    createPortalSession: jest.fn(),
  },
}))

jest.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getSubscription: jest.fn(),
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { BillingService } from '@/lib/billing'
import { SubscriptionService } from '@/lib/subscription'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockPrismaOrg = prisma.organization.findUnique as jest.Mock
const mockBillingService = BillingService as jest.Mocked<typeof BillingService>
const mockSubscriptionService = SubscriptionService as jest.Mocked<typeof SubscriptionService>

describe('POST /api/billing/portal', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'https://example.com'
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
    mockPrismaOrg.mockResolvedValueOnce(null)

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 404 when no subscription exists', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toContain('No subscription found')
  })

  it('creates portal session successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce({
        id: 'org_123',
        slug: 'test-org',
      })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createPortalSession.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_123',
    })

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.url).toBe('https://billing.stripe.com/portal_123')
  })

  it('allows admin to create portal session', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'other_user',
        members: [{ role: 'ADMIN' }],
      })
      .mockResolvedValueOnce({
        id: 'org_123',
        slug: 'test-org',
      })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createPortalSession.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_admin',
    })

    const response = await POST(createRequest({ organizationId: 'org_123' }))

    expect(response.status).toBe(200)
  })

  it('returns 403 for non-admin member', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [{ role: 'MEMBER' }],
    })

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 404 when organization not found in second lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce(null)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Organization not found')
  })

  it('uses custom return URL', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce({
        id: 'org_123',
        slug: 'test-org',
      })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createPortalSession.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_custom',
    })

    await POST(
      createRequest({
        organizationId: 'org_123',
        returnUrl: 'https://custom.com/return',
      })
    )

    expect(mockBillingService.createPortalSession).toHaveBeenCalledWith({
      customerId: 'cus_123',
      returnUrl: 'https://custom.com/return',
    })
  })

  it('returns 500 for unexpected errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockRejectedValueOnce(new Error('Database error'))

    const response = await POST(createRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')
  })
})

describe('GET /api/billing/portal', () => {
  const createGetRequest = (params: Record<string, string>): NextRequest => {
    const url = new URL('https://example.com/api/billing/portal')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return {
      url: url.toString(),
    } as unknown as NextRequest
  }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.NEXT_PUBLIC_BASE_URL = 'https://example.com'
  })

  it('redirects to signin when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await GET(createGetRequest({}))
    expect(response.url).toContain('/auth/signin')
  })

  it('returns 400 when organizationId missing', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })

    const response = await GET(createGetRequest({}))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('Missing organizationId')
  })

  it('returns 403 when user lacks access', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce(null)

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))

    expect(response.status).toBe(403)
  })

  it('redirects to portal on success', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce({
        id: 'org_123',
        slug: 'test-org',
      })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createPortalSession.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_redirect',
    })

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))

    expect(response.url).toBe('https://billing.stripe.com/portal_redirect')
  })

  it('returns 404 when no subscription found', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toContain('No subscription found')
  })

  it('returns 404 when organization not found', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce(null)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Organization not found')
  })

  it('uses custom return URL when provided', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      })
      .mockResolvedValueOnce({
        id: 'org_123',
        slug: 'test-org',
      })
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      customerId: 'cus_123',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createPortalSession.mockResolvedValueOnce({
      url: 'https://billing.stripe.com/portal_custom',
    })

    await GET(
      createGetRequest({
        organizationId: 'org_123',
        returnUrl: 'https://custom.com/return',
      })
    )

    expect(mockBillingService.createPortalSession).toHaveBeenCalledWith({
      customerId: 'cus_123',
      returnUrl: 'https://custom.com/return',
    })
  })

  it('returns 500 for unexpected errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaOrg.mockRejectedValueOnce(new Error('Database error'))

    const response = await GET(createGetRequest({ organizationId: 'org_123' }))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')
  })
})
