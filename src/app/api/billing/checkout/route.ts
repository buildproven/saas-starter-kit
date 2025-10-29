import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { BillingService } from '@/lib/billing'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

// Input validation schema
const createCheckoutSchema = z.object({
  priceId: z.string(),
  organizationId: z.string(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
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

  // Only owners and admins can manage billing
  const canManageBilling = member.role === 'ADMIN'
  return {
    hasAccess: canManageBilling,
    userRole: member.role,
    isOwner: false
  }
}

// POST /api/billing/checkout - Create Stripe checkout session
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createCheckoutSchema.parse(body)

    // Check organization access
    const { hasAccess } = await checkOrganizationAccess(
      validatedData.organizationId,
      session.user.id
    )

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Verify the plan exists
    const plan = await SubscriptionService.getPlanByPriceId(validatedData.priceId)
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      )
    }

    // Check if organization already has an active subscription
    const existingSubscription = await SubscriptionService.getSubscription(
      validatedData.organizationId
    )

    if (existingSubscription && existingSubscription.status === 'ACTIVE') {
      return NextResponse.json(
        { error: 'Organization already has an active subscription. Use billing portal to change plans.' },
        { status: 409 }
      )
    }

    // Get organization details
    const organization = await prisma.organization.findUnique({
      where: { id: validatedData.organizationId },
      include: {
        owner: {
          select: { email: true, name: true },
        },
      },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Create or get customer
    let customerId = existingSubscription?.customerId

    if (!customerId) {
      const customer = await BillingService.createCustomer({
        email: organization.owner.email,
        name: organization.owner.name || organization.name,
        organizationId: validatedData.organizationId,
      })
      customerId = customer.id
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const successUrl = validatedData.successUrl || `${baseUrl}/dashboard/${organization.slug}/billing?success=true`
    const cancelUrl = validatedData.cancelUrl || `${baseUrl}/dashboard/${organization.slug}/billing?canceled=true`

    const checkoutSession = await BillingService.createCheckoutSession({
      customerId,
      priceId: validatedData.priceId,
      organizationId: validatedData.organizationId,
      successUrl,
      cancelUrl,
    })

    return NextResponse.json({
      url: checkoutSession.url,
      plan: {
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        interval: plan.interval,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating checkout session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET /api/billing/checkout - Get checkout session details (for success page)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const organizationId = searchParams.get('organizationId')

    if (!sessionId || !organizationId) {
      return NextResponse.json(
        { error: 'Missing session_id or organizationId' },
        { status: 400 }
      )
    }

    // Check organization access
    const { hasAccess } = await checkOrganizationAccess(organizationId, session.user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // In production, you'd retrieve the actual session from Stripe
    // For now, return success status
    return NextResponse.json({
      status: 'complete',
      paymentStatus: 'paid',
      customerEmail: session.user.email,
      organization: {
        id: organizationId,
      },
    })
  } catch (error) {
    console.error('Error fetching checkout session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}