import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

// Input validation schemas
const subscriptionActionSchema = z.object({
  organizationId: z.string(),
})

interface RouteParams {
  params: {
    action: string
  }
}

// Helper function to check organization ownership/admin access
async function checkSubscriptionAccess(organizationId: string, userId: string) {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    include: {
      members: {
        where: { userId, status: 'ACTIVE' },
        select: { role: true },
      },
    },
  })

  if (!organization) {
    return { hasAccess: false, userRole: null, isOwner: false }
  }

  const isOwner = organization.ownerId === userId
  const member = organization.members[0]

  if (isOwner) {
    return { hasAccess: true, userRole: 'OWNER', isOwner: true }
  }

  if (!member) {
    return { hasAccess: false, userRole: null, isOwner: false }
  }

  // Only owners and admins can manage subscriptions
  const canManageSubscriptions = member.role === 'ADMIN'
  return {
    hasAccess: canManageSubscriptions,
    userRole: member.role,
    isOwner: false
  }
}

// POST /api/subscriptions/[action] - Perform subscription actions
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = params
    const body = await request.json()
    const validatedData = subscriptionActionSchema.parse(body)

    // Check organization access
    const { hasAccess } = await checkSubscriptionAccess(
      validatedData.organizationId,
      session.user.id
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get current subscription
    const subscription = await SubscriptionService.getSubscription(
      validatedData.organizationId
    )

    switch (action) {
      case 'cancel':
        if (!subscription) {
          return NextResponse.json(
            { error: 'No active subscription found' },
            { status: 404 }
          )
        }

        if (subscription.cancelAtPeriodEnd) {
          return NextResponse.json(
            { error: 'Subscription is already scheduled for cancellation' },
            { status: 409 }
          )
        }

        const cancelledSubscription = await SubscriptionService.cancelSubscription(
          validatedData.organizationId
        )

        return NextResponse.json({
          subscription: cancelledSubscription,
          message: 'Subscription will be cancelled at the end of the current billing period',
        })

      case 'reactivate':
        if (!subscription) {
          return NextResponse.json(
            { error: 'No subscription found' },
            { status: 404 }
          )
        }

        if (!subscription.cancelAtPeriodEnd) {
          return NextResponse.json(
            { error: 'Subscription is not scheduled for cancellation' },
            { status: 409 }
          )
        }

        if (subscription.currentPeriodEnd < new Date()) {
          return NextResponse.json(
            { error: 'Cannot reactivate expired subscription' },
            { status: 409 }
          )
        }

        const reactivatedSubscription = await SubscriptionService.reactivateSubscription(
          validatedData.organizationId
        )

        return NextResponse.json({
          subscription: reactivatedSubscription,
          message: 'Subscription reactivated successfully',
        })

      case 'usage':
        // Get current usage and limits
        const [usage, limits] = await Promise.all([
          SubscriptionService.getCurrentUsage(validatedData.organizationId),
          SubscriptionService.checkLimits(validatedData.organizationId),
        ])

        const features = await SubscriptionService.getPlanFeatures(
          validatedData.organizationId
        )

        return NextResponse.json({
          usage,
          limits: features,
          violations: limits.violations,
          hasViolations: limits.hasViolations,
          subscription,
        })

      case 'preview-downgrade':
        // Check what would happen if user downgrades
        const currentUsage = await SubscriptionService.getCurrentUsage(
          validatedData.organizationId
        )

        const requestedPriceId = body.newPriceId
        if (!requestedPriceId) {
          return NextResponse.json(
            { error: 'newPriceId is required for downgrade preview' },
            { status: 400 }
          )
        }

        const newPlan = await SubscriptionService.getPlanByPriceId(requestedPriceId)
        if (!newPlan) {
          return NextResponse.json(
            { error: 'Invalid plan selected' },
            { status: 400 }
          )
        }

        const newFeatures = newPlan.features as typeof features
        const warnings: string[] = []

        if (newFeatures.maxUsers !== -1 && currentUsage.users > newFeatures.maxUsers) {
          warnings.push(`You currently have ${currentUsage.users} users but the new plan only allows ${newFeatures.maxUsers}`)
        }

        if (newFeatures.maxProjects !== -1 && currentUsage.projects > newFeatures.maxProjects) {
          warnings.push(`You currently have ${currentUsage.projects} projects but the new plan only allows ${newFeatures.maxProjects}`)
        }

        if (newFeatures.maxApiKeys !== -1 && currentUsage.apiKeys > newFeatures.maxApiKeys) {
          warnings.push(`You currently have ${currentUsage.apiKeys} API keys but the new plan only allows ${newFeatures.maxApiKeys}`)
        }

        return NextResponse.json({
          currentUsage,
          newPlan,
          newFeatures,
          warnings,
          canDowngrade: warnings.length === 0,
        })

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        )
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error(`Error performing subscription action ${params.action}:`, error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}