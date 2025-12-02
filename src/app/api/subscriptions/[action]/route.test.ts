/**
 * Tests for Subscriptions Action API Routes
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

jest.mock('@/lib/subscription', () => ({
  SubscriptionService: {
    getSubscription: jest.fn(),
    cancelSubscription: jest.fn(),
    reactivateSubscription: jest.fn(),
    getCurrentUsage: jest.fn(),
    checkLimits: jest.fn(),
    getPlanFeatures: jest.fn(),
    getPlanByPriceId: jest.fn(),
  },
}))

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import { POST } from './route'

const mockGetServerSession = getServerSession as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockSubscriptionService = SubscriptionService as jest.Mocked<typeof SubscriptionService>

describe('Subscriptions Action API', () => {
  const mockSession = {
    user: { id: 'user_123', email: 'test@example.com' },
  }

  const mockOrganization = {
    id: 'org_123',
    ownerId: 'user_123',
    members: [{ role: 'OWNER' }],
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  const createRequest = (body: object): NextRequest => {
    return {
      json: jest.fn().mockResolvedValue(body),
    } as unknown as NextRequest
  }

  describe('POST /api/subscriptions/[action]', () => {
    describe('Authentication', () => {
      it('returns 401 when not authenticated', async () => {
        mockGetServerSession.mockResolvedValueOnce(null)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(401)
        expect(data.error).toBe('Unauthorized')
      })
    })

    describe('Authorization', () => {
      it('returns 403 when user is not a member', async () => {
        mockPrisma.organization.findUnique.mockResolvedValueOnce({
          id: 'org_123',
          ownerId: 'other_user',
          members: [],
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.error).toBe('Forbidden')
      })

      it('returns 403 when member is not admin', async () => {
        mockPrisma.organization.findUnique.mockResolvedValueOnce({
          id: 'org_123',
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(403)
        expect(data.error).toBe('Forbidden')
      })

      it('allows owner to manage subscriptions', async () => {
        mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrganization as never)
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: false,
        } as never)
        mockSubscriptionService.cancelSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })

        expect(response.status).toBe(200)
      })

      it('allows admin to manage subscriptions', async () => {
        mockPrisma.organization.findUnique.mockResolvedValueOnce({
          id: 'org_123',
          ownerId: 'other_user',
          members: [{ role: 'ADMIN' }],
        } as never)
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: false,
        } as never)
        mockSubscriptionService.cancelSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })

        expect(response.status).toBe(200)
      })
    })

    describe('cancel action', () => {
      beforeEach(() => {
        mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as never)
      })

      it('cancels active subscription', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: false,
        } as never)
        mockSubscriptionService.cancelSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.message).toContain('cancelled')
        expect(mockSubscriptionService.cancelSubscription).toHaveBeenCalledWith('org_123')
      })

      it('returns 404 when no subscription exists', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error).toContain('No active subscription')
      })

      it('returns 409 when already scheduled for cancellation', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(409)
        expect(data.error).toContain('already scheduled')
      })
    })

    describe('reactivate action', () => {
      beforeEach(() => {
        mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as never)
      })

      it('reactivates cancelled subscription', async () => {
        const futureDate = new Date(Date.now() + 86400000)
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: futureDate,
        } as never)
        mockSubscriptionService.reactivateSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: false,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'reactivate' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.message).toContain('reactivated')
      })

      it('returns 404 when no subscription exists', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce(null)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'reactivate' } })
        const data = await response.json()

        expect(response.status).toBe(404)
        expect(data.error).toContain('No subscription found')
      })

      it('returns 409 when not scheduled for cancellation', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: false,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'reactivate' } })
        const data = await response.json()

        expect(response.status).toBe(409)
        expect(data.error).toContain('not scheduled')
      })

      it('returns 409 when subscription has expired', async () => {
        const pastDate = new Date(Date.now() - 86400000)
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
          cancelAtPeriodEnd: true,
          currentPeriodEnd: pastDate,
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'reactivate' } })
        const data = await response.json()

        expect(response.status).toBe(409)
        expect(data.error).toContain('expired')
      })
    })

    describe('usage action', () => {
      beforeEach(() => {
        mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as never)
      })

      it('returns usage and limits', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 5,
          projects: 3,
          apiKeys: 2,
        })
        mockSubscriptionService.checkLimits.mockResolvedValueOnce({
          violations: [],
          hasViolations: false,
        })
        mockSubscriptionService.getPlanFeatures.mockResolvedValueOnce({
          maxUsers: 10,
          maxProjects: 10,
          maxApiKeys: 5,
        })

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'usage' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.usage).toBeDefined()
        expect(data.limits).toBeDefined()
        expect(data.hasViolations).toBe(false)
      })
    })

    describe('preview-downgrade action', () => {
      beforeEach(() => {
        mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as never)
      })

      it('returns 400 when newPriceId is missing', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 10,
          projects: 5,
          apiKeys: 3,
        })

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'preview-downgrade' } })
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('newPriceId')
      })

      it('returns 400 for invalid plan', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 10,
          projects: 5,
          apiKeys: 3,
        })
        mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce(null)

        const request = createRequest({ organizationId: 'org_123', newPriceId: 'invalid' })
        const response = await POST(request, { params: { action: 'preview-downgrade' } })
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('Invalid plan')
      })

      it('returns warnings when usage exceeds new limits', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 10,
          projects: 5,
          apiKeys: 3,
        })
        mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
          id: 'plan_starter',
          features: { maxUsers: 5, maxProjects: 3, maxApiKeys: 1 },
        } as never)

        const request = createRequest({ organizationId: 'org_123', newPriceId: 'price_starter' })
        const response = await POST(request, { params: { action: 'preview-downgrade' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.warnings.length).toBe(3)
        expect(data.canDowngrade).toBe(false)
      })

      it('allows downgrade when within limits', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 2,
          projects: 1,
          apiKeys: 1,
        })
        mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
          id: 'plan_starter',
          features: { maxUsers: 5, maxProjects: 3, maxApiKeys: 2 },
        } as never)

        const request = createRequest({ organizationId: 'org_123', newPriceId: 'price_starter' })
        const response = await POST(request, { params: { action: 'preview-downgrade' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.warnings.length).toBe(0)
        expect(data.canDowngrade).toBe(true)
      })

      it('handles unlimited plan features', async () => {
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)
        mockSubscriptionService.getCurrentUsage.mockResolvedValueOnce({
          users: 100,
          projects: 50,
          apiKeys: 25,
        })
        mockSubscriptionService.getPlanByPriceId.mockResolvedValueOnce({
          id: 'plan_enterprise',
          features: { maxUsers: -1, maxProjects: -1, maxApiKeys: -1 },
        } as never)

        const request = createRequest({ organizationId: 'org_123', newPriceId: 'price_enterprise' })
        const response = await POST(request, { params: { action: 'preview-downgrade' } })
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.canDowngrade).toBe(true)
      })
    })

    describe('Unknown action', () => {
      it('returns 400 for unknown action', async () => {
        mockPrisma.organization.findUnique.mockResolvedValue(mockOrganization as never)
        mockSubscriptionService.getSubscription.mockResolvedValueOnce({
          id: 'sub_123',
        } as never)

        const request = createRequest({ organizationId: 'org_123' })
        const response = await POST(request, { params: { action: 'unknown' } })
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toContain('Unknown action')
      })
    })

    describe('Validation', () => {
      it('returns 400 for invalid input', async () => {
        const request = createRequest({ organizationId: 123 })
        const response = await POST(request, { params: { action: 'cancel' } })
        const data = await response.json()

        expect(response.status).toBe(400)
        expect(data.error).toBe('Invalid input')
      })
    })
  })
})
