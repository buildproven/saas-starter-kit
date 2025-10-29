import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { SubscriptionService, PLAN_CONFIGS } from '@/lib/subscription'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// Input validation schema for creating plans
const createPlanSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  priceId: z.string(),
  amount: z.number().int().min(0),
  currency: z.string().default('usd'),
  interval: z.enum(['MONTH', 'YEAR']),
  features: z.object({
    maxUsers: z.number().int(),
    maxProjects: z.number().int(),
    maxApiKeys: z.number().int(),
    maxApiCallsPerMonth: z.number().int(),
    maxStorageGB: z.number().int(),
    prioritySupport: z.boolean(),
    customDomain: z.boolean(),
    analytics: z.boolean(),
    sso: z.boolean(),
    webhooks: z.boolean(),
  }),
})

// GET /api/plans - Get available subscription plans
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const plans = await SubscriptionService.getAvailablePlans()

    // Add pricing display information
    const plansWithDisplayInfo = plans.map(plan => ({
      ...plan,
      displayPrice: formatPrice(plan.amount, plan.currency, plan.interval),
      features: plan.features,
      isPopular: plan.name.toLowerCase() === 'pro', // Mark Pro as popular
    }))

    // Add free plan from config
    const freePlan = {
      id: 'free',
      name: 'Free',
      description: 'Perfect for getting started',
      priceId: 'free',
      amount: 0,
      currency: 'usd',
      interval: 'MONTH' as const,
      features: PLAN_CONFIGS.free,
      isActive: true,
      displayPrice: formatPrice(0, 'usd', 'MONTH'),
      isPopular: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const allPlans = [freePlan, ...plansWithDisplayInfo]

    return NextResponse.json({
      plans: allPlans,
      total: allPlans.length,
    })
  } catch (error) {
    console.error('Error fetching plans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/plans - Create new plan (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is super admin
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    })

    if (user?.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validatedData = createPlanSchema.parse(body)

    // Check if price ID already exists
    const existingPlan = await prisma.plan.findUnique({
      where: { priceId: validatedData.priceId },
    })

    if (existingPlan) {
      return NextResponse.json(
        { error: 'Plan with this price ID already exists' },
        { status: 409 }
      )
    }

    const plan = await prisma.plan.create({
      data: {
        name: validatedData.name,
        description: validatedData.description,
        priceId: validatedData.priceId,
        amount: validatedData.amount,
        currency: validatedData.currency,
        interval: validatedData.interval,
        features: validatedData.features,
      },
    })

    return NextResponse.json({
      plan: {
        ...plan,
        displayPrice: formatPrice(plan.amount, plan.currency, plan.interval),
      },
      message: 'Plan created successfully',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating plan:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Helper function to format price for display
function formatPrice(amount: number, currency: string, interval: string): string {
  if (amount === 0) {
    return 'Free'
  }

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
  })

  const price = formatter.format(amount / 100) // Convert cents to dollars
  const intervalText = interval === 'YEAR' ? 'year' : 'month'

  return `${price}/${intervalText}`
}