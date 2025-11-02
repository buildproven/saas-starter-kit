import { prisma } from '@/lib/prisma'
import { SubscriptionStatus } from '@prisma/client'

export interface PlanFeatures {
  maxUsers: number
  maxProjects: number
  maxApiKeys: number
  maxApiCallsPerMonth: number
  maxStorageGB: number
  prioritySupport: boolean
  customDomain: boolean
  analytics: boolean
  sso: boolean
  webhooks: boolean
}

// Default plan configurations
export const PLAN_CONFIGS: Record<string, PlanFeatures> = {
  free: {
    maxUsers: 1,
    maxProjects: 3,
    maxApiKeys: 2,
    maxApiCallsPerMonth: 10000,
    maxStorageGB: 1,
    prioritySupport: false,
    customDomain: false,
    analytics: false,
    sso: false,
    webhooks: false,
  },
  starter: {
    maxUsers: 5,
    maxProjects: 10,
    maxApiKeys: 10,
    maxApiCallsPerMonth: 100000,
    maxStorageGB: 10,
    prioritySupport: false,
    customDomain: true,
    analytics: true,
    sso: false,
    webhooks: false,
  },
  pro: {
    maxUsers: 25,
    maxProjects: 50,
    maxApiKeys: 50,
    maxApiCallsPerMonth: 1000000,
    maxStorageGB: 100,
    prioritySupport: true,
    customDomain: true,
    analytics: true,
    sso: true,
    webhooks: true,
  },
  enterprise: {
    maxUsers: -1, // unlimited
    maxProjects: -1, // unlimited
    maxApiKeys: -1, // unlimited
    maxApiCallsPerMonth: -1, // unlimited
    maxStorageGB: -1, // unlimited
    prioritySupport: true,
    customDomain: true,
    analytics: true,
    sso: true,
    webhooks: true,
  },
}

export class SubscriptionService {
  /**
   * Get organization's current subscription with plan details
   */
  static async getSubscription(organizationId: string) {
    return await prisma.subscription.findUnique({
      where: { organizationId },
      include: {
        plan: true,
        organization: true,
      },
    })
  }

  /**
   * Get organization's plan features
   */
  static async getPlanFeatures(organizationId: string): Promise<PlanFeatures> {
    const subscription = await this.getSubscription(organizationId)

    if (!subscription || !subscription.plan) {
      return PLAN_CONFIGS.free!
    }

    // Parse features from plan JSON or use defaults
    const planFeatures = subscription.plan.features as unknown as PlanFeatures
    return planFeatures || PLAN_CONFIGS.free!
  }

  /**
   * Check if organization can perform an action based on their plan
   */
  static async canPerformAction(
    organizationId: string,
    action: keyof PlanFeatures,
    currentCount?: number
  ): Promise<boolean> {
    const features = await this.getPlanFeatures(organizationId)
    const limit = features[action]

    // Unlimited access
    if (limit === -1) return true

    // Boolean features
    if (typeof limit === 'boolean') return limit

    // Count-based features
    if (typeof limit === 'number' && currentCount !== undefined) {
      return currentCount < limit
    }

    return false
  }

  /**
   * Get current usage for an organization
   */
  static async getCurrentUsage(organizationId: string) {
    const [userCount, projectCount, apiKeyCount, currentPeriodStart] = await Promise.all([
      prisma.organizationMember.count({
        where: { organizationId, status: 'ACTIVE' },
      }),
      prisma.project.count({
        where: { organizationId },
      }),
      prisma.apiKey.count({
        where: { organizationId },
      }),
      this.getCurrentPeriodStart(organizationId),
    ])

    // Get API calls for current billing period
    const apiCallsThisPeriod = await prisma.usageRecord.aggregate({
      where: {
        metric: 'api_calls',
        timestamp: {
          gte: currentPeriodStart,
        },
        OR: [
          {
            project: {
              organizationId,
            },
          },
          {
            apiKey: {
              organizationId,
            },
          },
        ],
      },
      _sum: {
        quantity: true,
      },
    })

    // Get storage usage
    const storageUsage = await prisma.usageRecord.aggregate({
      where: {
        metric: 'storage_gb',
        timestamp: {
          gte: currentPeriodStart,
        },
        project: {
          organizationId,
        },
      },
      _sum: {
        quantity: true,
      },
    })

    return {
      users: userCount,
      projects: projectCount,
      apiKeys: apiKeyCount,
      apiCallsThisPeriod: apiCallsThisPeriod._sum.quantity || 0,
      storageGB: storageUsage._sum.quantity || 0,
    }
  }

  /**
   * Check if organization has exceeded their plan limits
   */
  static async checkLimits(organizationId: string) {
    const [features, usage] = await Promise.all([
      this.getPlanFeatures(organizationId),
      this.getCurrentUsage(organizationId),
    ])

    const violations: string[] = []

    if (features.maxUsers !== -1 && usage.users > features.maxUsers) {
      violations.push(`User limit exceeded (${usage.users}/${features.maxUsers})`)
    }

    if (features.maxProjects !== -1 && usage.projects > features.maxProjects) {
      violations.push(`Project limit exceeded (${usage.projects}/${features.maxProjects})`)
    }

    if (features.maxApiKeys !== -1 && usage.apiKeys > features.maxApiKeys) {
      violations.push(`API key limit exceeded (${usage.apiKeys}/${features.maxApiKeys})`)
    }

    if (
      features.maxApiCallsPerMonth !== -1 &&
      usage.apiCallsThisPeriod > features.maxApiCallsPerMonth
    ) {
      violations.push(
        `API call limit exceeded (${usage.apiCallsThisPeriod}/${features.maxApiCallsPerMonth})`
      )
    }

    if (features.maxStorageGB !== -1 && usage.storageGB > features.maxStorageGB) {
      violations.push(`Storage limit exceeded (${usage.storageGB}GB/${features.maxStorageGB}GB)`)
    }

    return {
      hasViolations: violations.length > 0,
      violations,
      usage,
      limits: features,
    }
  }

  /**
   * Record usage for billing and analytics
   */
  static async recordUsage(
    metric: string,
    quantity: number,
    projectId?: string,
    apiKeyId?: string
  ) {
    return await prisma.usageRecord.create({
      data: {
        metric,
        quantity,
        projectId,
        apiKeyId,
        timestamp: new Date(),
      },
    })
  }

  /**
   * Get the start of the current billing period
   */
  private static async getCurrentPeriodStart(organizationId: string): Promise<Date> {
    const subscription = await this.getSubscription(organizationId)

    if (subscription?.currentPeriodStart) {
      return subscription.currentPeriodStart
    }

    // Default to start of current month for free plans
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  }

  /**
   * Create a new subscription record
   */
  static async createSubscription(data: {
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

  /**
   * Update subscription status
   */
  static async updateSubscription(
    subscriptionId: string,
    updates: Partial<{
      status: SubscriptionStatus
      currentPeriodStart: Date
      currentPeriodEnd: Date
      cancelAtPeriodEnd: boolean
    }>
  ) {
    return await prisma.subscription.update({
      where: { subscriptionId },
      data: updates,
      include: {
        plan: true,
        organization: true,
      },
    })
  }

  /**
   * Cancel subscription at period end
   */
  static async cancelSubscription(organizationId: string) {
    return await prisma.subscription.update({
      where: { organizationId },
      data: {
        cancelAtPeriodEnd: true,
      },
    })
  }

  /**
   * Reactivate a cancelled subscription
   */
  static async reactivateSubscription(organizationId: string) {
    return await prisma.subscription.update({
      where: { organizationId },
      data: {
        cancelAtPeriodEnd: false,
        status: 'ACTIVE',
      },
    })
  }

  /**
   * Get available plans
   */
  static async getAvailablePlans() {
    return await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { amount: 'asc' },
    })
  }

  /**
   * Get plan by price ID
   */
  static async getPlanByPriceId(priceId: string) {
    return await prisma.plan.findUnique({
      where: { priceId },
    })
  }
}
