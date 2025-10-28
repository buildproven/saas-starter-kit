import { prisma } from './prisma'
import {
  OrganizationRole,
  SubscriptionStatus
} from '@prisma/client'

// Organization utilities
export async function createOrganization(data: {
  name: string
  slug: string
  description?: string
  ownerId: string
}) {
  return await prisma.organization.create({
    data: {
      ...data,
      members: {
        create: {
          userId: data.ownerId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      },
    },
    include: {
      members: true,
      subscription: true,
    },
  })
}

export async function getUserOrganizations(userId: string) {
  return await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
          _count: {
            select: {
              members: true,
              projects: true,
            },
          },
        },
      },
    },
  })
}

export async function getOrganizationWithDetails(organizationId: string) {
  return await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      owner: true,
      members: {
        include: {
          user: true,
        },
      },
      subscription: {
        include: {
          plan: true,
        },
      },
      projects: {
        include: {
          _count: {
            select: {
              usageRecords: true,
            },
          },
        },
      },
      apiKeys: {
        where: { isActive: true },
      },
    },
  })
}

// Subscription utilities
export async function createSubscription(data: {
  organizationId: string
  priceId: string
  customerId: string
  subscriptionId: string
  status: SubscriptionStatus
  currentPeriodStart: Date
  currentPeriodEnd: Date
}) {
  return await prisma.subscription.create({
    data,
    include: {
      plan: true,
      organization: true,
    },
  })
}

export async function updateSubscriptionStatus(
  subscriptionId: string,
  status: SubscriptionStatus,
  currentPeriodEnd?: Date
) {
  return await prisma.subscription.update({
    where: { subscriptionId },
    data: {
      status,
      ...(currentPeriodEnd && { currentPeriodEnd }),
    },
  })
}

// Usage tracking utilities
export async function recordUsage(data: {
  metric: string
  quantity: number
  projectId?: string
  apiKeyId?: string
}) {
  return await prisma.usageRecord.create({
    data,
  })
}

export async function getUsageStats(
  organizationId: string,
  metric: string,
  startDate: Date,
  endDate: Date
) {
  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: { id: true },
  })

  const projectIds = projects.map(p => p.id)

  return await prisma.usageRecord.groupBy({
    by: ['projectId'],
    where: {
      projectId: { in: projectIds },
      metric,
      timestamp: {
        gte: startDate,
        lte: endDate,
      },
    },
    _sum: {
      quantity: true,
    },
  })
}

// API Key utilities
export async function createApiKey(data: {
  name: string
  keyHash: string
  userId?: string
  organizationId?: string
  expiresAt?: Date
}) {
  return await prisma.apiKey.create({
    data,
  })
}

export async function getApiKeyByHash(keyHash: string) {
  return await prisma.apiKey.findUnique({
    where: { keyHash },
    include: {
      user: true,
      organization: true,
    },
  })
}

export async function updateApiKeyLastUsed(keyHash: string) {
  return await prisma.apiKey.update({
    where: { keyHash },
    data: { lastUsedAt: new Date() },
  })
}

// Project utilities
export async function createProject(data: {
  name: string
  description?: string
  organizationId: string
}) {
  return await prisma.project.create({
    data,
  })
}

export async function getProjectsByOrganization(organizationId: string) {
  return await prisma.project.findMany({
    where: { organizationId },
    include: {
      _count: {
        select: {
          usageRecords: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })
}

// Member management utilities
export async function addOrganizationMember(data: {
  organizationId: string
  userId: string
  role: OrganizationRole
}) {
  return await prisma.organizationMember.create({
    data: {
      ...data,
      status: 'PENDING',
    },
    include: {
      user: true,
      organization: true,
    },
  })
}

export async function updateMemberRole(
  organizationId: string,
  userId: string,
  role: OrganizationRole
) {
  return await prisma.organizationMember.update({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    data: { role },
  })
}

export async function activateMember(
  organizationId: string,
  userId: string
) {
  return await prisma.organizationMember.update({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
    data: { status: 'ACTIVE' },
  })
}

// Plan utilities
export async function getAllPlans() {
  return await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { amount: 'asc' },
  })
}

export async function getPlanByPriceId(priceId: string) {
  return await prisma.plan.findUnique({
    where: { priceId },
  })
}