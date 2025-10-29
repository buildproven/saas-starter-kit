import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

// Input validation schemas
const createSubscriptionSchema = z.object({
  organizationId: z.string(),
  priceId: z.string(),
  customerId: z.string(),
  subscriptionId: z.string(),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
})

const updateSubscriptionSchema = z.object({
  status: z.enum(['INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID']).optional(),
  currentPeriodStart: z.string().datetime().optional(),
  currentPeriodEnd: z.string().datetime().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
})

// Helper function to check organization access
async function checkOrganizationAccess(organizationId: string, userId: string) {
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

  return { hasAccess: true, userRole: member.role, isOwner: false }
}

// GET /api/subscriptions - Get user's organization subscriptions
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (organizationId) {
      // Get specific organization subscription
      const { hasAccess } = await checkOrganizationAccess(organizationId, session.user.id)
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }

      const subscription = await SubscriptionService.getSubscription(organizationId)
      const [usage, limits] = await Promise.all([
        SubscriptionService.getCurrentUsage(organizationId),
        SubscriptionService.checkLimits(organizationId),
      ])

      return NextResponse.json({
        subscription,
        usage,
        limits,
      })
    } else {
      // Get all subscriptions for user's organizations
      const organizations = await prisma.organization.findMany({
        where: {
          OR: [
            { ownerId: session.user.id },
            {
              members: {
                some: {
                  userId: session.user.id,
                  status: 'ACTIVE',
                },
              },
            },
          ],
        },
        include: {
          subscription: {
            include: {
              plan: true,
            },
          },
        },
      })

      const subscriptionsWithUsage = await Promise.all(
        organizations.map(async (org) => {
          const [usage, limits] = await Promise.all([
            SubscriptionService.getCurrentUsage(org.id),
            SubscriptionService.checkLimits(org.id),
          ])

          return {
            organization: {
              id: org.id,
              name: org.name,
              slug: org.slug,
            },
            subscription: org.subscription,
            usage,
            limits,
          }
        })
      )

      return NextResponse.json({
        subscriptions: subscriptionsWithUsage,
        total: subscriptionsWithUsage.length,
      })
    }
  } catch (error) {
    console.error('Error fetching subscriptions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/subscriptions - Create new subscription (webhook/internal use)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createSubscriptionSchema.parse(body)

    // Check organization access (owner or admin required)
    const { hasAccess, userRole, isOwner } = await checkOrganizationAccess(
      validatedData.organizationId,
      session.user.id
    )

    if (!hasAccess || (!isOwner && userRole !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check if organization already has a subscription
    const existingSubscription = await SubscriptionService.getSubscription(
      validatedData.organizationId
    )

    if (existingSubscription) {
      return NextResponse.json(
        { error: 'Organization already has an active subscription' },
        { status: 409 }
      )
    }

    // Verify the plan exists
    const plan = await SubscriptionService.getPlanByPriceId(validatedData.priceId)
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      )
    }

    const subscription = await SubscriptionService.createSubscription({
      ...validatedData,
      status: 'ACTIVE',
      currentPeriodStart: new Date(validatedData.currentPeriodStart),
      currentPeriodEnd: new Date(validatedData.currentPeriodEnd),
    })

    return NextResponse.json({
      subscription,
      message: 'Subscription created successfully',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/subscriptions - Update subscription status (webhook use)
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const subscriptionId = searchParams.get('subscriptionId')

    if (!subscriptionId) {
      return NextResponse.json(
        { error: 'Subscription ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const validatedData = updateSubscriptionSchema.parse(body)

    // Get subscription and check access
    const subscription = await prisma.subscription.findUnique({
      where: { subscriptionId },
      include: { organization: true },
    })

    if (!subscription) {
      return NextResponse.json(
        { error: 'Subscription not found' },
        { status: 404 }
      )
    }

    const { hasAccess, userRole, isOwner } = await checkOrganizationAccess(
      subscription.organizationId,
      session.user.id
    )

    if (!hasAccess || (!isOwner && userRole !== 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Prepare update data
    const updateData: any = {}
    if (validatedData.status) updateData.status = validatedData.status
    if (validatedData.currentPeriodStart) {
      updateData.currentPeriodStart = new Date(validatedData.currentPeriodStart)
    }
    if (validatedData.currentPeriodEnd) {
      updateData.currentPeriodEnd = new Date(validatedData.currentPeriodEnd)
    }
    if (validatedData.cancelAtPeriodEnd !== undefined) {
      updateData.cancelAtPeriodEnd = validatedData.cancelAtPeriodEnd
    }

    const updatedSubscription = await SubscriptionService.updateSubscription(
      subscriptionId,
      updateData
    )

    return NextResponse.json({
      subscription: updatedSubscription,
      message: 'Subscription updated successfully',
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating subscription:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}