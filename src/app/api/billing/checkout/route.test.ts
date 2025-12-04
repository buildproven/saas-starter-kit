import { POST, GET } from './route'
import type { NextRequest } from 'next/server'

// Mock NextResponse to return proper json method
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

// Mock next-auth
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

// Mock auth options
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

// Mock billing service
vi.mock('@/lib/billing', () => ({
  BillingService: {
    createCustomer: vi.fn(),
    createCheckoutSession: vi.fn(),
    getCheckoutSession: vi.fn(),
  },
}))

// Mock subscription service
vi.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getPlanByPriceId: vi.fn(),
    getSubscription: vi.fn(),
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { BillingService } from '@/lib/billing'
import { SubscriptionService } from '@/lib/subscription'

const mockGetServerSession = getServerSession as vi.MockedFunction<typeof getServerSession>
const mockPrismaOrg = prisma.organization.findUnique as vi.Mock
const mockBillingService = BillingService as vi.Mocked<typeof BillingService>
const mockSubscriptionService = SubscriptionService as vi.Mocked<typeof SubscriptionService>

describe('POST /api/billing/checkout', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
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
      user: { id: 'user_123', email: 'test@example.com' },
    })

    const response = await POST(createRequest({ invalid: 'data' }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 403 when user lacks organization access', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce(null)

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 400 for invalid plan', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce(null)

    const response = await POST(
      createRequest({
        priceId: 'price_invalid',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid plan selected')
  })

  it('returns 409 when organization has active subscription', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      status: 'ACTIVE',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('already has an active subscription')
  })

  it('creates checkout session successfully', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    // First call for access check, second for org details
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
      .mockResolvedValueOnce({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'user_123',
        owner: { email: 'owner@example.com', name: 'Owner' },
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)
    mockBillingService.createCustomer.mockResolvedValueOnce({ id: 'cus_123', organizationId: 'org_123', email: 'test@example.com' })
    mockBillingService.createCheckoutSession.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_123',
    })

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.url).toBe('https://checkout.stripe.com/session_123')
    expect(json.plan.name).toBe('Pro')
    expect(json.plan.amount).toBe(2900)
  })

  it('allows admin to create checkout session', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'admin@example.com' },
    })
    // User is not owner but is ADMIN member
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'other_user',
        members: [{ role: 'ADMIN' }],
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
      .mockResolvedValueOnce({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'other_user',
        owner: { email: 'owner@example.com', name: 'Owner' },
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)
    mockBillingService.createCustomer.mockResolvedValueOnce({ id: 'cus_123', organizationId: 'org_123', email: 'admin@example.com' })
    mockBillingService.createCheckoutSession.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_123',
    })

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )

    expect(response.status).toBe(200)
  })

  it('returns 403 for non-admin member', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'member@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [{ role: 'MEMBER' }],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 404 when organization not found in second lookup', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
      .mockResolvedValueOnce(null) // Second lookup returns null

    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)

    const response = await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(404)
    expect(json.error).toBe('Organization not found')
  })

  it('reuses existing customer ID', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
      .mockResolvedValueOnce({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'user_123',
        owner: { email: 'owner@example.com', name: 'Owner' },
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    // Return canceled subscription with existing customer ID
    mockSubscriptionService.getSubscription.mockResolvedValueOnce({
      status: 'CANCELED',
      customerId: 'cus_existing',
    } as Awaited<ReturnType<typeof SubscriptionService.getSubscription>>)
    mockBillingService.createCheckoutSession.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_123',
    })

    await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
      })
    )

    expect(mockBillingService.createCustomer).not.toHaveBeenCalled()
    expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_existing',
      })
    )
  })

  it('uses custom success and cancel URLs', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg
      .mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'user_123',
        members: [],
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
      .mockResolvedValueOnce({
        id: 'org_123',
        name: 'Test Org',
        slug: 'test-org',
        ownerId: 'user_123',
        owner: { email: 'owner@example.com', name: 'Owner' },
      } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)
    mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)
    mockBillingService.createCustomer.mockResolvedValueOnce({ id: 'cus_123', organizationId: 'org_123', email: 'test@example.com' })
    mockBillingService.createCheckoutSession.mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/session_123',
    })

    await POST(
      createRequest({
        priceId: 'price_123',
        organizationId: 'org_123',
        successUrl: 'https://custom.com/success',
        cancelUrl: 'https://custom.com/cancel',
      })
    )

    expect(mockBillingService.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        successUrl: 'https://custom.com/success',
        cancelUrl: 'https://custom.com/cancel',
      })
    )
  })
})

describe('GET /api/billing/checkout', () => {
  const createGetRequest = (params: Record<string, string>): NextRequest => {
    const url = new URL('https://example.com/api/billing/checkout')
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    return {
      url: url.toString(),
    } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await GET(createGetRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 400 when missing required params', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })

    const response = await GET(createGetRequest({}))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toContain('Missing')
  })

  it('returns 403 when user has no access', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'other_user',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)

    const response = await GET(
      createGetRequest({
        session_id: 'cs_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns checkout session details', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
    mockBillingService.getCheckoutSession.mockResolvedValueOnce({
      id: 'cs_123',
      status: 'complete',
      paymentStatus: 'paid',
      customerEmail: 'test@example.com',
      priceId: 'price_123',
    })
    mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
      id: 'plan_123',
      name: 'Pro',
      amount: 2900,
      currency: 'usd',
      interval: 'MONTH',
    } as Awaited<ReturnType<typeof SubscriptionService.getPlanByPriceId>>)

    const response = await GET(
      createGetRequest({
        session_id: 'cs_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.status).toBe('complete')
    expect(json.paymentStatus).toBe('paid')
    expect(json.plan.name).toBe('Pro')
  })

  it('returns null plan when no priceId in session', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
    mockBillingService.getCheckoutSession.mockResolvedValueOnce({
      id: 'cs_123',
      status: 'open',
      paymentStatus: 'unpaid',
      customerEmail: null,
      priceId: null,
    })

    const response = await GET(
      createGetRequest({
        session_id: 'cs_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.plan).toBeNull()
  })

  it('returns 500 for unexpected errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123', email: 'test@example.com' },
    })
    mockPrismaOrg.mockResolvedValueOnce({
      id: 'org_123',
      ownerId: 'user_123',
      members: [],
    } as unknown as Awaited<ReturnType<typeof prisma.organization.findUnique>>)
    mockBillingService.getCheckoutSession.mockRejectedValueOnce(new Error('Stripe error'))

    const response = await GET(
      createGetRequest({
        session_id: 'cs_123',
        organizationId: 'org_123',
      })
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')
  })
})
