/**
 * Tests for Database Utilities
 */

jest.mock('./prisma', () => ({
  prisma: {
    organization: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    organizationMember: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    subscription: {
      create: jest.fn(),
      update: jest.fn(),
    },
    usageRecord: {
      create: jest.fn(),
      groupBy: jest.fn(),
    },
    apiKey: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    project: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    plan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
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

const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('Database Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('Organization utilities', () => {
    it('createOrganization creates with owner as member', async () => {
      const orgData = {
        name: 'Test Org',
        slug: 'test-org',
        description: 'A test org',
        ownerId: 'user_123',
      }

      mockPrisma.organization.create.mockResolvedValueOnce({
        id: 'org_123',
        ...orgData,
        members: [],
        subscription: null,
      } as never)

      await createOrganization(orgData)

      expect(mockPrisma.organization.create).toHaveBeenCalledWith(
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
      mockPrisma.organizationMember.findMany.mockResolvedValueOnce([
        {
          organizationId: 'org_123',
          organization: { id: 'org_123', name: 'Test Org' },
        },
      ] as never)

      const result = await getUserOrganizations('user_123')

      expect(result).toHaveLength(1)
      expect(mockPrisma.organizationMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user_123' },
        })
      )
    })

    it('getOrganizationWithDetails includes all relations', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_123',
        owner: {},
        members: [],
        subscription: null,
        projects: [],
        apiKeys: [],
      } as never)

      await getOrganizationWithDetails('org_123')

      expect(mockPrisma.organization.findUnique).toHaveBeenCalledWith(
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

      mockPrisma.subscription.create.mockResolvedValueOnce({
        ...subData,
        plan: { name: 'Pro' },
      } as never)

      await createSubscription(subData)

      expect(mockPrisma.subscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: subData,
        })
      )
    })

    it('updateSubscriptionStatus updates status', async () => {
      mockPrisma.subscription.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        status: 'CANCELED',
      } as never)

      await updateSubscriptionStatus('sub_123', 'CANCELED')

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { subscriptionId: 'sub_123' },
          data: expect.objectContaining({ status: 'CANCELED' }),
        })
      )
    })

    it('updateSubscriptionStatus updates period end', async () => {
      const newEnd = new Date()
      mockPrisma.subscription.update.mockResolvedValueOnce({
        subscriptionId: 'sub_123',
        currentPeriodEnd: newEnd,
      } as never)

      await updateSubscriptionStatus('sub_123', 'ACTIVE', newEnd)

      expect(mockPrisma.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ currentPeriodEnd: newEnd }),
        })
      )
    })
  })

  describe('Usage tracking utilities', () => {
    it('recordUsage creates usage record', async () => {
      mockPrisma.usageRecord.create.mockResolvedValueOnce({
        id: 'usage_123',
        metric: 'api_calls',
        quantity: 100,
      } as never)

      await recordUsage({ metric: 'api_calls', quantity: 100, projectId: 'proj_123' })

      expect(mockPrisma.usageRecord.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metric: 'api_calls',
            quantity: 100,
          }),
        })
      )
    })

    it('getUsageStats aggregates by project', async () => {
      mockPrisma.project.findMany.mockResolvedValueOnce([{ id: 'proj_1' }, { id: 'proj_2' }] as never)
      mockPrisma.usageRecord.groupBy.mockResolvedValueOnce([
        { projectId: 'proj_1', _sum: { quantity: 500 } },
      ] as never)

      const startDate = new Date('2024-01-01')
      const endDate = new Date('2024-01-31')

      await getUsageStats('org_123', 'api_calls', startDate, endDate)

      expect(mockPrisma.usageRecord.groupBy).toHaveBeenCalledWith(
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
      mockPrisma.apiKey.create.mockResolvedValueOnce({
        id: 'key_123',
        name: 'Test Key',
        keyHash: 'hash123',
      } as never)

      await createApiKey({ name: 'Test Key', keyHash: 'hash123', organizationId: 'org_123' })

      expect(mockPrisma.apiKey.create).toHaveBeenCalled()
    })

    it('getApiKeyByHash finds key with relations', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
        id: 'key_123',
        user: {},
        organization: {},
      } as never)

      await getApiKeyByHash('hash123')

      expect(mockPrisma.apiKey.findUnique).toHaveBeenCalledWith(
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
      mockPrisma.apiKey.update.mockResolvedValueOnce({
        keyHash: 'hash123',
        lastUsedAt: new Date(),
      } as never)

      await updateApiKeyLastUsed('hash123')

      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith(
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
      mockPrisma.project.create.mockResolvedValueOnce({
        id: 'proj_123',
        name: 'Test Project',
        organizationId: 'org_123',
      } as never)

      await createProject({ name: 'Test Project', organizationId: 'org_123' })

      expect(mockPrisma.project.create).toHaveBeenCalled()
    })

    it('getProjectsByOrganization returns sorted projects', async () => {
      mockPrisma.project.findMany.mockResolvedValueOnce([
        { id: 'proj_1', name: 'Project 1' },
        { id: 'proj_2', name: 'Project 2' },
      ] as never)

      await getProjectsByOrganization('org_123')

      expect(mockPrisma.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org_123' },
          orderBy: { createdAt: 'desc' },
        })
      )
    })
  })

  describe('Member management utilities', () => {
    it('addOrganizationMember creates pending member', async () => {
      mockPrisma.organizationMember.create.mockResolvedValueOnce({
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

      expect(mockPrisma.organizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
          }),
        })
      )
    })

    it('updateMemberRole updates role', async () => {
      mockPrisma.organizationMember.update.mockResolvedValueOnce({
        role: 'ADMIN',
      } as never)

      await updateMemberRole('org_123', 'user_456', 'ADMIN')

      expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { role: 'ADMIN' },
        })
      )
    })

    it('activateMember sets status to ACTIVE', async () => {
      mockPrisma.organizationMember.update.mockResolvedValueOnce({
        status: 'ACTIVE',
      } as never)

      await activateMember('org_123', 'user_456')

      expect(mockPrisma.organizationMember.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'ACTIVE' },
        })
      )
    })
  })

  describe('Plan utilities', () => {
    it('getAllPlans returns active plans sorted', async () => {
      mockPrisma.plan.findMany.mockResolvedValueOnce([
        { id: 'plan_1', name: 'Starter', amount: 900 },
        { id: 'plan_2', name: 'Pro', amount: 2900 },
      ] as never)

      await getAllPlans()

      expect(mockPrisma.plan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isActive: true },
          orderBy: { amount: 'asc' },
        })
      )
    })

    it('getPlanByPriceId finds plan by price ID', async () => {
      mockPrisma.plan.findUnique.mockResolvedValueOnce({
        id: 'plan_pro',
        priceId: 'price_pro',
      } as never)

      await getPlanByPriceId('price_pro')

      expect(mockPrisma.plan.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { priceId: 'price_pro' },
        })
      )
    })
  })
})
