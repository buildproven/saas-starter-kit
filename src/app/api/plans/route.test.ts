/**
 * Tests for Plans API
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
    user: {
      findUnique: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getAvailablePlans: jest.fn(),
  },
  PLAN_CONFIGS: {
    free: {
      maxUsers: 1,
      maxProjects: 3,
      maxApiKeys: 1,
      maxApiCallsPerMonth: 1000,
      maxStorageGB: 1,
      prioritySupport: false,
      customDomain: false,
      analytics: false,
      sso: false,
      webhooks: false,
    },
  },
}))

import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>
const mockGetAvailablePlans = SubscriptionService.getAvailablePlans as jest.Mock
const mockPrismaUserFindUnique = prisma.user.findUnique as jest.Mock
const mockPrismaPlanFindUnique = prisma.plan.findUnique as jest.Mock
const mockPrismaPlanCreate = prisma.plan.create as jest.Mock

describe('GET /api/plans', () => {
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

  it('returns available plans with free plan included', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockGetAvailablePlans.mockResolvedValueOnce([
      {
        id: 'plan_starter',
        name: 'Starter',
        amount: 900,
        currency: 'usd',
        interval: 'MONTH',
        features: {},
      },
      {
        id: 'plan_pro',
        name: 'Pro',
        amount: 2900,
        currency: 'usd',
        interval: 'MONTH',
        features: {},
      },
    ])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.plans).toHaveLength(3) // free + 2 paid
    expect(json.plans[0].name).toBe('Free')
    expect(json.plans[0].displayPrice).toBe('Free')
    expect(json.plans[1].displayPrice).toBe('$9/month')
    expect(json.plans[2].displayPrice).toBe('$29/month')
  })

  it('marks Pro plan as popular', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockGetAvailablePlans.mockResolvedValueOnce([
      {
        id: 'plan_pro',
        name: 'Pro',
        amount: 2900,
        currency: 'usd',
        interval: 'MONTH',
        features: {},
      },
    ])

    const response = await GET()
    const json = await response.json()

    const proPlan = json.plans.find((p: { name: string }) => p.name === 'Pro')
    expect(proPlan.isPopular).toBe(true)
  })

  it('handles yearly pricing format', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockGetAvailablePlans.mockResolvedValueOnce([
      {
        id: 'plan_annual',
        name: 'Annual',
        amount: 29900,
        currency: 'usd',
        interval: 'YEAR',
        features: {},
      },
    ])

    const response = await GET()
    const json = await response.json()

    expect(json.plans[1].displayPrice).toBe('$299/year')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockGetAvailablePlans.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})

describe('POST /api/plans', () => {
  const createRequest = (body: Record<string, unknown>): NextRequest =>
    ({
      json: jest.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  const validPlanData = {
    name: 'New Plan',
    priceId: 'price_new',
    productId: 'prod_new',
    amount: 1900,
    currency: 'usd',
    interval: 'MONTH',
    features: {
      maxUsers: 10,
      maxProjects: 20,
      maxApiKeys: 5,
      maxApiCallsPerMonth: 50000,
      maxStorageGB: 10,
      prioritySupport: true,
      customDomain: true,
      analytics: true,
      sso: false,
      webhooks: true,
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValueOnce(null)

    const response = await POST(createRequest(validPlanData))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 403 when user is not super admin', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'USER' })

    const response = await POST(createRequest(validPlanData))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json.error).toBe('Forbidden')
  })

  it('returns 400 for invalid input', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'SUPER_ADMIN' })

    const response = await POST(createRequest({ name: 'Test', invalid: true }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid input')
  })

  it('returns 409 when price ID already exists', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'SUPER_ADMIN' })
    mockPrismaPlanFindUnique.mockResolvedValueOnce({ id: 'existing_plan' })

    const response = await POST(createRequest(validPlanData))
    const json = await response.json()

    expect(response.status).toBe(409)
    expect(json.error).toContain('already exists')
  })

  it('creates plan successfully for super admin', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'SUPER_ADMIN' })
    mockPrismaPlanFindUnique.mockResolvedValueOnce(null)
    mockPrismaPlanCreate.mockResolvedValueOnce({
      id: 'new_plan',
      ...validPlanData,
    })

    const response = await POST(createRequest(validPlanData))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.plan.name).toBe('New Plan')
    expect(json.plan.displayPrice).toBe('$19/month')
    expect(json.message).toBe('Plan created successfully')
  })

  it('handles yearly plans correctly', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'SUPER_ADMIN' })
    mockPrismaPlanFindUnique.mockResolvedValueOnce(null)

    const yearlyPlan = { ...validPlanData, interval: 'YEAR', amount: 19900 }
    mockPrismaPlanCreate.mockResolvedValueOnce({
      id: 'yearly_plan',
      ...yearlyPlan,
    })

    const response = await POST(createRequest(yearlyPlan))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.plan.displayPrice).toBe('$199/year')
  })

  it('handles internal errors', async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: 'user_123' },
    })
    mockPrismaUserFindUnique.mockResolvedValueOnce({ role: 'SUPER_ADMIN' })
    mockPrismaPlanFindUnique.mockResolvedValueOnce(null)
    mockPrismaPlanCreate.mockRejectedValueOnce(new Error('Database error'))

    const errorSpy = jest.spyOn(console, 'error').mockImplementation()
    const response = await POST(createRequest(validPlanData))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Internal server error')

    errorSpy.mockRestore()
  })
})
