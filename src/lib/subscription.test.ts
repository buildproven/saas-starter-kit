vi.mock('@/lib/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organizationMember: {
      count: vi.fn(),
    },
    project: {
      count: vi.fn(),
    },
    apiKey: {
      count: vi.fn(),
    },
    usageRecord: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    plan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { SubscriptionService, PLAN_CONFIGS } from './subscription'
import { prisma } from '@/lib/prisma'

// Type-safe mock accessors
const subMock = prisma.subscription as { findUnique: vi.Mock; create: vi.Mock; update: vi.Mock }
const memberMock = prisma.organizationMember as { count: vi.Mock }
const projectMock = prisma.project as { count: vi.Mock }
const apiKeyMock = prisma.apiKey as { count: vi.Mock }
const usageMock = prisma.usageRecord as { aggregate: vi.Mock; create: vi.Mock }
const planMock = prisma.plan as { findMany: vi.Mock; findUnique: vi.Mock }

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('PLAN_CONFIGS', () => {
    it('has correct free plan limits', () => {
      expect(PLAN_CONFIGS.free.maxUsers).toBe(1)
      expect(PLAN_CONFIGS.free.maxProjects).toBe(3)
      expect(PLAN_CONFIGS.free.prioritySupport).toBe(false)
    })

    it('has correct enterprise plan with unlimited access', () => {
      expect(PLAN_CONFIGS.enterprise.maxUsers).toBe(-1)
      expect(PLAN_CONFIGS.enterprise.maxProjects).toBe(-1)
      expect(PLAN_CONFIGS.enterprise.prioritySupport).toBe(true)
    })
  })

  describe('getSubscription', () => {
    it('returns subscription with plan and organization', async () => {
      const mockSubscription = {
        id: 'sub_123',
        organizationId: 'org_123',
        plan: { id: 'plan_pro', name: 'Pro' },
        organization: { id: 'org_123', name: 'Test Org' },
      }
      subMock.findUnique.mockResolvedValueOnce(mockSubscription)

      const result = await SubscriptionService.getSubscription('org_123')

      expect(result).toEqual(mockSubscription)
      expect(subMock.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        include: { plan: true, organization: true },
      })
    })

    it('returns null for non-existent subscription', async () => {
      subMock.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getSubscription('org_none')
      expect(result).toBeNull()
    })
  })

  describe('getPlanFeatures', () => {
    it('returns plan features from subscription', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: {
          features: {
            maxUsers: 25,
            maxProjects: 50,
            prioritySupport: true,
          },
        },
      })

      const result = await SubscriptionService.getPlanFeatures('org_123')

      expect(result.maxUsers).toBe(25)
      expect(result.prioritySupport).toBe(true)
    })

    it('returns free plan defaults when no subscription', async () => {
      subMock.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getPlanFeatures('org_free')

      expect(result).toEqual(PLAN_CONFIGS.free)
    })
  })

  describe('canPerformAction', () => {
    it('returns true for unlimited access (-1)', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: { features: { maxUsers: -1 } },
      })

      const result = await SubscriptionService.canPerformAction('org_enterprise', 'maxUsers', 100)
      expect(result).toBe(true)
    })

    it('returns true for boolean features that are enabled', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: { features: { prioritySupport: true } },
      })

      const result = await SubscriptionService.canPerformAction('org_pro', 'prioritySupport')
      expect(result).toBe(true)
    })

    it('returns false for boolean features that are disabled', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: { features: { sso: false } },
      })

      const result = await SubscriptionService.canPerformAction('org_starter', 'sso')
      expect(result).toBe(false)
    })

    it('returns true when under limit', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: { features: { maxProjects: 10 } },
      })

      const result = await SubscriptionService.canPerformAction('org_123', 'maxProjects', 5)
      expect(result).toBe(true)
    })

    it('returns false when at or over limit', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        plan: { features: { maxProjects: 10 } },
      })

      const result = await SubscriptionService.canPerformAction('org_123', 'maxProjects', 10)
      expect(result).toBe(false)
    })
  })

  describe('getCurrentUsage', () => {
    it('returns current usage counts', async () => {
      subMock.findUnique.mockResolvedValueOnce({
        currentPeriodStart: new Date('2024-01-01'),
      })
      memberMock.count.mockResolvedValueOnce(5)
      projectMock.count.mockResolvedValueOnce(3)
      apiKeyMock.count.mockResolvedValueOnce(2)
      usageMock.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 50000 } })
        .mockResolvedValueOnce({ _sum: { quantity: 5 } })

      const result = await SubscriptionService.getCurrentUsage('org_123')

      expect(result.users).toBe(5)
      expect(result.projects).toBe(3)
      expect(result.apiKeys).toBe(2)
      expect(result.apiCallsThisPeriod).toBe(50000)
      expect(result.storageGB).toBe(5)
    })

    it('handles null aggregates gracefully', async () => {
      subMock.findUnique.mockResolvedValueOnce(null)
      memberMock.count.mockResolvedValueOnce(0)
      projectMock.count.mockResolvedValueOnce(0)
      apiKeyMock.count.mockResolvedValueOnce(0)
      usageMock.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: null } })
        .mockResolvedValueOnce({ _sum: { quantity: null } })

      const result = await SubscriptionService.getCurrentUsage('org_free')

      expect(result.apiCallsThisPeriod).toBe(0)
      expect(result.storageGB).toBe(0)
    })
  })

  describe('checkLimits', () => {
    it('returns violations when exceeding limits', async () => {
      subMock.findUnique.mockResolvedValue({
        plan: { features: PLAN_CONFIGS.free },
        currentPeriodStart: new Date(),
      })
      memberMock.count.mockResolvedValue(5) // Exceeds free limit of 1
      projectMock.count.mockResolvedValue(10) // Exceeds free limit of 3
      apiKeyMock.count.mockResolvedValue(1)
      usageMock.aggregate.mockResolvedValue({ _sum: { quantity: 0 } })

      const result = await SubscriptionService.checkLimits('org_over_limit')

      expect(result.hasViolations).toBe(true)
      expect(result.violations.length).toBeGreaterThan(0)
      expect(result.violations.some(v => v.includes('User limit'))).toBe(true)
    })

    it('returns usage and limits in result', async () => {
      subMock.findUnique.mockResolvedValue({
        plan: { features: PLAN_CONFIGS.starter },
        currentPeriodStart: new Date(),
      })
      memberMock.count.mockResolvedValue(2)
      projectMock.count.mockResolvedValue(3)
      apiKeyMock.count.mockResolvedValue(1)
      usageMock.aggregate.mockResolvedValue({ _sum: { quantity: 5000 } })

      const result = await SubscriptionService.checkLimits('org_123')

      expect(result.usage).toBeDefined()
      expect(result.limits).toBeDefined()
      expect(result.usage.users).toBe(2)
    })
  })

  describe('recordUsage', () => {
    it('creates usage record', async () => {
      usageMock.create.mockResolvedValueOnce({
        id: 'usage_123',
        metric: 'api_calls',
        quantity: 100,
      })

      await SubscriptionService.recordUsage('api_calls', 100, 'proj_123')

      expect(usageMock.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          metric: 'api_calls',
          quantity: 100,
          projectId: 'proj_123',
        }),
      })
    })
  })

  describe('createSubscription', () => {
    it('creates new subscription', async () => {
      const subscriptionData = {
        organizationId: 'org_123',
        priceId: 'price_pro',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        status: 'ACTIVE' as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      }
      subMock.create.mockResolvedValueOnce({
        ...subscriptionData,
        plan: { name: 'Pro' },
        organization: { name: 'Test' },
      })

      const result = await SubscriptionService.createSubscription(subscriptionData)

      expect(result.organizationId).toBe('org_123')
      expect(subMock.create).toHaveBeenCalled()
    })
  })

  describe('updateSubscription', () => {
    it('updates subscription status', async () => {
      subMock.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        status: 'PAST_DUE',
      })

      await SubscriptionService.updateSubscription('sub_123', {
        status: 'PAST_DUE',
      })

      expect(subMock.update).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub_123' },
        data: { status: 'PAST_DUE' },
        include: { plan: true, organization: true },
      })
    })
  })

  describe('cancelSubscription', () => {
    it('sets cancelAtPeriodEnd to true', async () => {
      subMock.update.mockResolvedValueOnce({
        organizationId: 'org_123',
        cancelAtPeriodEnd: true,
      })

      await SubscriptionService.cancelSubscription('org_123')

      expect(subMock.update).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        data: { cancelAtPeriodEnd: true },
      })
    })
  })

  describe('reactivateSubscription', () => {
    it('reactivates cancelled subscription', async () => {
      subMock.update.mockResolvedValueOnce({
        organizationId: 'org_123',
        cancelAtPeriodEnd: false,
        status: 'ACTIVE',
      })

      await SubscriptionService.reactivateSubscription('org_123')

      expect(subMock.update).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        data: { cancelAtPeriodEnd: false, status: 'ACTIVE' },
      })
    })
  })

  describe('getAvailablePlans', () => {
    it('returns active plans sorted by amount', async () => {
      planMock.findMany.mockResolvedValueOnce([
        { id: 'plan_starter', name: 'Starter', amount: 900 },
        { id: 'plan_pro', name: 'Pro', amount: 2900 },
      ])

      const result = await SubscriptionService.getAvailablePlans()

      expect(result).toHaveLength(2)
      expect(planMock.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { amount: 'asc' },
      })
    })
  })

  describe('getPlanByPriceId', () => {
    it('returns plan for given price ID', async () => {
      planMock.findUnique.mockResolvedValueOnce({
        id: 'plan_pro',
        priceId: 'price_pro',
        name: 'Pro',
      })

      const result = await SubscriptionService.getPlanByPriceId('price_pro')

      expect(result?.name).toBe('Pro')
    })

    it('returns null for unknown price ID', async () => {
      planMock.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getPlanByPriceId('price_unknown')
      expect(result).toBeNull()
    })
  })
})
