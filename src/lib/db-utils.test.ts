/**
 * Tests for Database Utilities
 */

vi.mock('./prisma', () => ({
  prisma: {
    organization: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    organizationMember: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    subscription: {
      create: vi.fn(),
      update: vi.fn(),
    },
    usageRecord: {
      create: vi.fn(),
      groupBy: vi.fn(),
    },
    apiKey: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    project: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    plan: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}))

import { prisma } from './prisma'
import {
  createOrganization,
  getUserOrganizations,
  getOrganizationWithDetails,
  createSubscription,
  updateSubscriptionStatus,
  recordUsage,
  getUsageStats,
  createApiKey,
  getApiKeyByHash,
  updateApiKeyLastUsed,
  createProject,
  getProjectsByOrganization,
  addOrganizationMember,
  updateMemberRole,
  activateMember,
  getAllPlans,
  getPlanByPriceId,
} from './db-utils'

const mockOrganization = vi.mocked(prisma.organization, true)
const mockOrganizationMember = vi.mocked(prisma.organizationMember, true)
const mockSubscription = vi.mocked(prisma.subscription, true)
const mockUsageRecord = vi.mocked(prisma.usageRecord, true)
const mockApiKey = vi.mocked(prisma.apiKey, true)
const mockProject = vi.mocked(prisma.project, true)
const mockPlan = vi.mocked(prisma.plan, true)

describe('Database Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Organization utilities', () => {
    it('createOrganization creates with owner as member', async () => {
      const orgData = {
        name: 'Test Org',
        slug: 'test-org',
        description: 'A test org',
        ownerId: 'user_123',
      }

      mockOrganization.create.mockResolvedValueOnce({
        id: 'org_123',
        ...orgData,
        members: [],
        subscription: null,
      } as never)

      await createOrganization(orgData)

      expect(mockOrganization.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            members: expect.objectContaining({
              create: expect.objectContaining({
                role: 'OWNER',
              }),
            }),
          }),
        })
      )
    })

    it('getUserOrganizations returns user memberships', async () => {
      mockOrganizationMember.findMany.mockResolvedValueOnce([
        {
          organizationId: 'org_123',
          organization: { id: 'org_123', name: 'Test Org' },
        },
      ] as never)

      const result = await getUserOrganizations('user_123')

      expect(result).toHaveLength(1)
      expect(mockOrganizationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_123' },
        })
      )
    })

    it('getOrganizationWithDetails includes all relations', async () => {
      mockOrganization.findUnique.mockResolvedValueOnce({
        id: 'org_123',
        owner: {},
        members: [],
        subscription: null,
        projects: [],
        apiKeys: [],
      } as never)

      await getOrganizationWithDetails('org_123')

      expect(mockOrganization.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            owner: true,
            members: expect.any(Object),
            subscription: expect.any(Object),
            projects: expect.any(Object),
            apiKeys: expect.any(Object),
          }),
        })
      )
    })
  })

  describe('Subscription utilities', () => {
    it('createSubscription creates with plan info', async () => {
      const subData = {
        organizationId: 'org_123',
        priceId: 'price_pro',
        customerId: 'cus_123',
        subscriptionId: 'sub_123',
        status: 'ACTIVE' as const,
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(),
      }

      mockSubscription.create.mockResolvedValueOnce({
        ...subData,
        plan: { name: 'Pro' },
      } as never)

      await createSubscription(subData)

      expect(mockSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: subData,
        })
      )
    })

    it('updateSubscriptionStatus updates status', async () => {
      mockSubscription.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        status: 'CANCELED',
      } as never)

      await updateSubscriptionStatus('sub_123', 'CANCELED')

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId: 'sub_123' },
          data: expect.objectContaining({ status: 'CANCELED' }),
        })
      )
    })

    it('updateSubscriptionStatus updates period end', async () => {
      const newEnd = new Date()
      mockSubscription.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        currentPeriodEnd: newEnd,
      } as never)

      await updateSubscriptionStatus('sub_123', 'ACTIVE', newEnd)

      expect(mockSubscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentPeriodEnd: newEnd }),
        })
      )
    })
  })

  describe('Usage tracking utilities', () => {
    it('recordUsage creates usage record', async () => {
      mockUsageRecord.create.mockResolvedValueOnce({
        id: 'usage_123',
        metric: 'api_calls',
        quantity: 100,
      } as never)

      await recordUsage({ metric: 'api_calls', quantity: 100, projectId: 'proj_123' })

      expect(mockUsageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metric: 'api_calls',
            quantity: 100,
          }),
        })
      )
    })

    it('getUsageStats aggregates by project', async () => {
      mockProject.findMany.mockResolvedValueOnce([{ id: 'proj_1' }, { id: 'proj_2' }] as never)
      mockUsageRecord.groupBy.mockResolvedValueOnce([
        { projectId: 'proj_1', _sum: { quantity: 500 } },
      ] as never)

      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      await getUsageStats('org_123', 'api_calls', startDate, endDate)

      expect(mockUsageRecord.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['projectId'],
          where: expect.objectContaining({
            metric: 'api_calls',
          }),
        })
      )
    })
  })

  describe('API Key utilities', () => {
    it('createApiKey creates key', async () => {
      mockApiKey.create.mockResolvedValueOnce({
        id: 'key_123',
        name: 'Test Key',
        keyHash: 'hash123',
      } as never)

      await createApiKey({ name: 'Test Key', keyHash: 'hash123', organizationId: 'org_123' })

      expect(mockApiKey.create).toHaveBeenCalled()
    })

    it('getApiKeyByHash finds key with relations', async () => {
      mockApiKey.findUnique.mockResolvedValueOnce({
        id: 'key_123',
        user: {},
        organization: {},
      } as never)

      await getApiKeyByHash('hash123')

      expect(mockApiKey.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { keyHash: 'hash123' },
          include: expect.objectContaining({
            user: true,
            organization: true,
          }),
        })
      )
    })

    it('updateApiKeyLastUsed updates timestamp', async () => {
      mockApiKey.update.mockResolvedValueOnce({
        keyHash: 'hash123',
        lastUsedAt: new Date(),
      } as never)

      await updateApiKeyLastUsed('hash123')

      expect(mockApiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { keyHash: 'hash123' },
          data: expect.objectContaining({
            lastUsedAt: expect.any(Date),
          }),
        })
      )
    })
  })

  describe('Project utilities', () => {
    it('createProject creates project', async () => {
      mockProject.create.mockResolvedValueOnce({
        id: 'proj_123',
        name: 'Test Project',
        organizationId: 'org_123',
      } as never)

      await createProject({ name: 'Test Project', organizationId: 'org_123' })

      expect(mockProject.create).toHaveBeenCalled()
    })

    it('getProjectsByOrganization returns sorted projects', async () => {
      mockProject.findMany.mockResolvedValueOnce([
        { id: 'proj_1', name: 'Project 1' },
        { id: 'proj_2', name: 'Project 2' },
      ] as never)

      await getProjectsByOrganization('org_123')

      expect(mockProject.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org_123' },
          orderBy: { createdAt: 'desc' },
        })
      )
    })
  })

  describe('Member management utilities', () => {
    it('addOrganizationMember creates pending member', async () => {
      mockOrganizationMember.create.mockResolvedValueOnce({
        organizationId: 'org_123',
        userId: 'user_456',
        role: 'MEMBER',
        status: 'PENDING',
      } as never)

      await addOrganizationMember({
        organizationId: 'org_123',
        userId: 'user_456',
        role: 'MEMBER',
      })

      expect(mockOrganizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      )
    })

    it('updateMemberRole updates role', async () => {
      mockOrganizationMember.update.mockResolvedValueOnce({
        role: 'ADMIN',
      } as never)

      await updateMemberRole('org_123', 'user_456', 'ADMIN')

      expect(mockOrganizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'ADMIN' },
        })
      )
    })

    it('activateMember sets status to ACTIVE', async () => {
      mockOrganizationMember.update.mockResolvedValueOnce({
        status: 'ACTIVE',
      } as never)

      await activateMember('org_123', 'user_456')

      expect(mockOrganizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ACTIVE' },
        })
      )
    })
  })

  describe('Plan utilities', () => {
    it('getAllPlans returns active plans sorted', async () => {
      mockPlan.findMany.mockResolvedValueOnce([
        { id: 'plan_1', name: 'Starter', amount: 900 },
        { id: 'plan_2', name: 'Pro', amount: 2900 },
      ] as never)

      await getAllPlans()

      expect(mockPlan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { amount: 'asc' },
        })
      )
    })

    it('getPlanByPriceId finds plan by price ID', async () => {
      mockPlan.findUnique.mockResolvedValueOnce({
        id: 'plan_pro',
        priceId: 'price_pro',
      } as never)

      await getPlanByPriceId('price_pro')

      expect(mockPlan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { priceId: 'price_pro' },
        })
      )
    })
  })
})
