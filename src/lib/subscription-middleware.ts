import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService } from '@/lib/subscription'
import { prisma } from '@/lib/prisma'

export interface SubscriptionContext {
  organizationId: string
  userId: string
  features: any
  usage: any
}

/**
 * Middleware to check subscription limits for API endpoints
 */
export async function withSubscriptionCheck(
  handler: (request: NextRequest, context: SubscriptionContext) => Promise<NextResponse>,
  options: {
    feature: string // Feature to check (e.g., 'maxProjects', 'maxApiKeys')
    action?: 'create' | 'read' | 'update' | 'delete' // Default: 'create'
    getOrganizationId: (request: NextRequest) => Promise<string> | string
  }
) {
  return async (request: NextRequest) => {
    try {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      const organizationId = await options.getOrganizationId(request)
      const action = options.action || 'create'

      // Get organization and check access
      const organization = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          members: {
            where: { userId: session.user.id, status: 'ACTIVE' },
            select: { role: true },
          },
        },
      })

      if (!organization) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
      }

      const isOwner = organization.ownerId === session.user.id
      const member = organization.members[0]

      if (!isOwner && !member) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      // Get subscription features and current usage
      const [features, usage] = await Promise.all([
        SubscriptionService.getPlanFeatures(organizationId),
        SubscriptionService.getCurrentUsage(organizationId),
      ])

      // Check subscription limits for create actions
      if (action === 'create') {
        const canPerform = await SubscriptionService.canPerformAction(
          organizationId,
          options.feature as keyof typeof features,
          getCurrentCount(usage, options.feature)
        )

        if (!canPerform) {
          const limit = features[options.feature]
          const current = getCurrentCount(usage, options.feature)

          return NextResponse.json({
            error: 'Subscription limit exceeded',
            details: {
              feature: options.feature,
              limit: limit === -1 ? 'unlimited' : limit,
              current,
              upgradeRequired: true,
            },
          }, { status: 402 }) // Payment Required
        }
      }

      // Check other feature restrictions
      if (options.feature === 'prioritySupport' && !features.prioritySupport) {
        return NextResponse.json({
          error: 'Priority support not available on current plan',
          upgradeRequired: true,
        }, { status: 402 })
      }

      if (options.feature === 'analytics' && !features.analytics) {
        return NextResponse.json({
          error: 'Analytics not available on current plan',
          upgradeRequired: true,
        }, { status: 402 })
      }

      if (options.feature === 'sso' && !features.sso) {
        return NextResponse.json({
          error: 'SSO not available on current plan',
          upgradeRequired: true,
        }, { status: 402 })
      }

      if (options.feature === 'webhooks' && !features.webhooks) {
        return NextResponse.json({
          error: 'Webhooks not available on current plan',
          upgradeRequired: true,
        }, { status: 402 })
      }

      // Call the actual handler with context
      const context: SubscriptionContext = {
        organizationId,
        userId: session.user.id,
        features,
        usage,
      }

      return await handler(request, context)
    } catch (error) {
      console.error('Subscription middleware error:', error)
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      )
    }
  }
}

/**
 * Helper to get current count for a specific feature
 */
function getCurrentCount(usage: any, feature: string): number {
  switch (feature) {
    case 'maxUsers':
      return usage.users
    case 'maxProjects':
      return usage.projects
    case 'maxApiKeys':
      return usage.apiKeys
    case 'maxApiCallsPerMonth':
      return usage.apiCallsThisPeriod
    case 'maxStorageGB':
      return usage.storageGB
    default:
      return 0
  }
}

/**
 * Helper to record API usage for billing
 */
export async function recordApiUsage(
  organizationId: string,
  apiKeyId?: string,
  projectId?: string
) {
  try {
    await SubscriptionService.recordUsage(
      'api_calls',
      1,
      projectId,
      apiKeyId
    )
  } catch (error) {
    console.error('Failed to record API usage:', error)
    // Don't fail the request if usage recording fails
  }
}

/**
 * Middleware specifically for API key usage tracking
 */
export async function withApiUsageTracking(
  handler: (request: NextRequest, context: any) => Promise<NextResponse>
) {
  return async (request: NextRequest) => {
    const response = await handler(request, {})

    // Record usage after successful API call
    if (response.status >= 200 && response.status < 300) {
      try {
        // Extract API key or organization info from request
        const apiKey = request.headers.get('x-api-key')
        const organizationId = request.headers.get('x-organization-id')

        if (apiKey && organizationId) {
          await recordApiUsage(organizationId, apiKey)
        }
      } catch (error) {
        console.error('Failed to track API usage:', error)
      }
    }

    return response
  }
}

/**
 * Check if organization can access premium features
 */
export async function checkPremiumFeature(
  organizationId: string,
  feature: 'prioritySupport' | 'analytics' | 'sso' | 'webhooks' | 'customDomain'
): Promise<boolean> {
  try {
    const features = await SubscriptionService.getPlanFeatures(organizationId)
    return features[feature] === true
  } catch (error) {
    console.error('Error checking premium feature:', error)
    return false
  }
}

/**
 * Webhook endpoint middleware for Stripe/payment provider webhooks
 */
export function withWebhookAuth(
  handler: (request: NextRequest) => Promise<NextResponse>,
  options: {
    webhookSecret: string
    validateSignature: (request: NextRequest, secret: string) => boolean
  }
) {
  return async (request: NextRequest) => {
    try {
      // Validate webhook signature
      const isValid = options.validateSignature(request, options.webhookSecret)

      if (!isValid) {
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
      }

      return await handler(request)
    } catch (error) {
      console.error('Webhook authentication error:', error)
      return NextResponse.json(
        { error: 'Webhook authentication failed' },
        { status: 401 }
      )
    }
  }
}