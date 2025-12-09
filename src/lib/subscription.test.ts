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

// Type-safe mock accessors using vi.mocked()
const mockSubscription = vi.mocked(prisma.subscription, true)
const mockOrganizationMember = vi.mocked(prisma.organizationMember, true)
const mockProject = vi.mocked(prisma.project, true)
const mockApiKey = vi.mocked(prisma.apiKey, true)
const mockUsageRecord = vi.mocked(prisma.usageRecord, true)
const mockPlan = vi.mocked(prisma.plan, true)

describe('SubscriptionService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('PLAN_CONFIGS', () => {
    it('has correct free plan limits', () => {
      expect(PLAN_CONFIGS.free!.maxUsers).toBe(1)
      expect(PLAN_CONFIGS.free!.maxProjects).toBe(3)
      expect(PLAN_CONFIGS.free!.prioritySupport).toBe(false)
    })

    it('has correct enterprise plan with unlimited access', () => {
      expect(PLAN_CONFIGS.enterprise!.maxUsers).toBe(-1)
      expect(PLAN_CONFIGS.enterprise!.maxProjects).toBe(-1)
      expect(PLAN_CONFIGS.enterprise!.prioritySupport).toBe(true)
    })
  })

  describe('getSubscription', () => {
    it('returns subscription with plan and organization', async () => {
      const mockSubscriptionData = {
        id: 'sub_123',
        organizationId: 'org_123',
        plan: { id: 'plan_pro', name: 'Pro' },
        organization: { id: 'org_123', name: 'Test Org' },
      }
      mockSubscription.findUnique.mockResolvedValueOnce(mockSubscriptionData as never)

      const result = await SubscriptionService.getSubscription('org_123')

      expect(result).toEqual(mockSubscriptionData)
      expect(mockSubscription.findUnique).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        include: { plan: true, organization: true },
      })
    })

    it('returns null for non-existent subscription', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getSubscription('org_none')
      expect(result).toBeNull()
    })
  })

  describe('getPlanFeatures', () => {
    it('returns plan features from subscription', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: {
          features: {
            maxUsers: 25,
            maxProjects: 50,
            prioritySupport: true,
          },
        },
      } as never)

      const result = await SubscriptionService.getPlanFeatures('org_123')

      expect(result.maxUsers).toBe(25)
      expect(result.prioritySupport).toBe(true)
    })

    it('returns free plan defaults when no subscription', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getPlanFeatures('org_free')

      expect(result).toEqual(PLAN_CONFIGS.free)
    })
  })

  describe('canPerformAction', () => {
    it('returns true for unlimited access (-1)', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: { features: { maxUsers: -1 } },
      } as never)

      const result = await SubscriptionService.canPerformAction('org_enterprise', 'maxUsers', 100)
      expect(result).toBe(true)
    })

    it('returns true for boolean features that are enabled', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: { features: { prioritySupport: true } },
      } as never)

      const result = await SubscriptionService.canPerformAction('org_pro', 'prioritySupport')
      expect(result).toBe(true)
    })

    it('returns false for boolean features that are disabled', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: { features: { sso: false } },
      } as never)

      const result = await SubscriptionService.canPerformAction('org_starter', 'sso')
      expect(result).toBe(false)
    })

    it('returns true when under limit', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: { features: { maxProjects: 10 } },
      } as never)

      const result = await SubscriptionService.canPerformAction('org_123', 'maxProjects', 5)
      expect(result).toBe(true)
    })

    it('returns false when at or over limit', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        plan: { features: { maxProjects: 10 } },
      } as never)

      const result = await SubscriptionService.canPerformAction('org_123', 'maxProjects', 10)
      expect(result).toBe(false)
    })
  })

  describe('getCurrentUsage', () => {
    it('returns current usage counts', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce({
        currentPeriodStart: new Date('2024-01-01'),
      } as never)
      mockOrganizationMember.count.mockResolvedValueOnce(5)
      mockProject.count.mockResolvedValueOnce(3)
      mockApiKey.count.mockResolvedValueOnce(2)
      mockUsageRecord.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: 50000 } } as never)
        .mockResolvedValueOnce({ _sum: { quantity: 5 } } as never)

      const result = await SubscriptionService.getCurrentUsage('org_123')

      expect(result.users).toBe(5)
      expect(result.projects).toBe(3)
      expect(result.apiKeys).toBe(2)
      expect(result.apiCallsThisPeriod).toBe(50000)
      expect(result.storageGB).toBe(5)
    })

    it('handles null aggregates gracefully', async () => {
      mockSubscription.findUnique.mockResolvedValueOnce(null)
      mockOrganizationMember.count.mockResolvedValueOnce(0)
      mockProject.count.mockResolvedValueOnce(0)
      mockApiKey.count.mockResolvedValueOnce(0)
      mockUsageRecord.aggregate
        .mockResolvedValueOnce({ _sum: { quantity: null } } as never)
        .mockResolvedValueOnce({ _sum: { quantity: null } } as never)

      const result = await SubscriptionService.getCurrentUsage('org_free')

      expect(result.apiCallsThisPeriod).toBe(0)
      expect(result.storageGB).toBe(0)
    })
  })

  describe('checkLimits', () => {
    it('returns violations when exceeding limits', async () => {
      mockSubscription.findUnique.mockResolvedValue({
        plan: { features: PLAN_CONFIGS.free },
        currentPeriodStart: new Date(),
      } as never)
      mockOrganizationMember.count.mockResolvedValue(5) // Exceeds free limit of 1
      mockProject.count.mockResolvedValue(10) // Exceeds free limit of 3
      mockApiKey.count.mockResolvedValue(1)
      mockUsageRecord.aggregate.mockResolvedValue({ _sum: { quantity: 0 } } as never)

      const result = await SubscriptionService.checkLimits('org_over_limit')

      expect(result.hasViolations).toBe(true)
      expect(result.violations.length).toBeGreaterThan(0)
      expect(result.violations.some((v) => v.includes('User limit'))).toBe(true)
    })

    it('returns usage and limits in result', async () => {
      mockSubscription.findUnique.mockResolvedValue({
        plan: { features: PLAN_CONFIGS.starter },
        currentPeriodStart: new Date(),
      } as never)
      mockOrganizationMember.count.mockResolvedValue(2)
      mockProject.count.mockResolvedValue(3)
      mockApiKey.count.mockResolvedValue(1)
      mockUsageRecord.aggregate.mockResolvedValue({ _sum: { quantity: 5000 } } as never)

      const result = await SubscriptionService.checkLimits('org_123')

      expect(result.usage).toBeDefined()
      expect(result.limits).toBeDefined()
      expect(result.usage.users).toBe(2)
    })
  })

  describe('recordUsage', () => {
    it('creates usage record', async () => {
      mockUsageRecord.create.mockResolvedValueOnce({
        id: 'usage_123',
        metric: 'api_calls',
        quantity: 100,
      } as never)

      await SubscriptionService.recordUsage('api_calls', 100, 'proj_123')

      expect(mockUsageRecord.create).toHaveBeenCalledWith({
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
      mockSubscription.create.mockResolvedValueOnce({
        ...subscriptionData,
        plan: { name: 'Pro' },
        organization: { name: 'Test' },
      } as never)

      const result = await SubscriptionService.createSubscription(subscriptionData)

      expect(result.organizationId).toBe('org_123')
      expect(mockSubscription.create).toHaveBeenCalled()
    })
  })

  describe('updateSubscription', () => {
    it('updates subscription status', async () => {
      mockSubscription.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        status: 'PAST_DUE',
      } as never)

      await SubscriptionService.updateSubscription('sub_123', {
        status: 'PAST_DUE',
      })

      expect(mockSubscription.update).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub_123' },
        data: { status: 'PAST_DUE' },
        include: { plan: true, organization: true },
      })
    })
  })

  describe('cancelSubscription', () => {
    it('sets cancelAtPeriodEnd to true', async () => {
      mockSubscription.update.mockResolvedValueOnce({
        organizationId: 'org_123',
        cancelAtPeriodEnd: true,
      } as never)

      await SubscriptionService.cancelSubscription('org_123')

      expect(mockSubscription.update).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        data: { cancelAtPeriodEnd: true },
      })
    })
  })

  describe('reactivateSubscription', () => {
    it('reactivates cancelled subscription', async () => {
      mockSubscription.update.mockResolvedValueOnce({
        organizationId: 'org_123',
        cancelAtPeriodEnd: false,
        status: 'ACTIVE',
      } as never)

      await SubscriptionService.reactivateSubscription('org_123')

      expect(mockSubscription.update).toHaveBeenCalledWith({
        where: { organizationId: 'org_123' },
        data: { cancelAtPeriodEnd: false, status: 'ACTIVE' },
      })
    })
  })

  describe('getAvailablePlans', () => {
    it('returns active plans sorted by amount', async () => {
      mockPlan.findMany.mockResolvedValueOnce([
        { id: 'plan_starter', name: 'Starter', amount: 900 },
        { id: 'plan_pro', name: 'Pro', amount: 2900 },
      ] as never)

      const result = await SubscriptionService.getAvailablePlans()

      expect(result).toHaveLength(2)
      expect(mockPlan.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { amount: 'asc' },
      })
    })
  })

  describe('getPlanByPriceId', () => {
    it('returns plan for given price ID', async () => {
      mockPlan.findUnique.mockResolvedValueOnce({
        id: 'plan_pro',
        priceId: 'price_pro',
        name: 'Pro',
      } as never)

      const result = await SubscriptionService.getPlanByPriceId('price_pro')

      expect(result?.name).toBe('Pro')
    })

    it('returns null for unknown price ID', async () => {
      mockPlan.findUnique.mockResolvedValueOnce(null)

      const result = await SubscriptionService.getPlanByPriceId('price_unknown')
      expect(result).toBeNull()
    })
  })
})
