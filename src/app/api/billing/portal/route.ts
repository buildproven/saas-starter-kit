import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { BillingService } from '@/lib/billing'
import { SubscriptionService } from '@/lib/subscription'
import { z } from 'zod'

const createPortalSchema = z.object({
  organizationId: z.string(),
  returnUrl: z.string().url().optional(),
})

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

  const canManageBilling = member.role === 'ADMIN'
  return {
    hasAccess: canManageBilling,
    userRole: member.role,
    isOwner: false,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const validatedData = createPortalSchema.parse(body)

    const { hasAccess } = await checkOrganizationAccess(validatedData.organizationId, user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subscription = await SubscriptionService.getSubscription(validatedData.organizationId)

    if (!subscription) {
      return NextResponse.json(
        { error: 'No subscription found. Please create a subscription first.' },
        { status: 404 }
      )
    }

    const organization = await prisma.organization.findUnique({
      where: { id: validatedData.organizationId },
      select: { slug: true },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const returnUrl = validatedData.returnUrl || `${baseUrl}/dashboard/${organization.slug}/billing`

    const portalSession = await BillingService.createPortalSession({
      customerId: subscription.customerId,
      returnUrl,
    })

    return NextResponse.json({
      url: portalSession.url,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.issues }, { status: 400 })
    }

    console.error('Error creating portal session:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getUser()
    if (!user?.id) {
      return NextResponse.redirect('/login')
    }

    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')
    const returnUrl = searchParams.get('returnUrl')

    if (!organizationId) {
      return NextResponse.json({ error: 'Missing organizationId' }, { status: 400 })
    }

    const { hasAccess } = await checkOrganizationAccess(organizationId, user.id)

    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const subscription = await SubscriptionService.getSubscription(organizationId)

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { slug: true },
    })

    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const defaultReturnUrl = `${baseUrl}/dashboard/${organization.slug}/billing`

    const portalSession = await BillingService.createPortalSession({
      customerId: subscription.customerId,
      returnUrl: returnUrl || defaultReturnUrl,
    })

    return NextResponse.redirect(portalSession.url)
  } catch (error) {
    console.error('Error redirecting to portal:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
