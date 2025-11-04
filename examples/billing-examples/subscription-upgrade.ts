/**
 * Example: Subscription Upgrade Flow
 *
 * This example demonstrates how to implement subscription upgrades,
 * downgrades, and plan changes with proper Stripe integration and
 * usage limit enforcement.
 *
 * Includes both API route implementation and client-side usage.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { withAuth } from '@/lib/auth/api-protection'
import { SubscriptionService } from '@/lib/subscription'
import { logError } from '@/lib/error-logging'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Validation schemas
const UpgradeRequestSchema = z.object({
  organizationId: z.string().min(1),
  newPriceId: z.string().min(1),
  billingCycle: z.enum(['MONTHLY', 'YEARLY']).optional(),
})

const DowngradeRequestSchema = z.object({
  organizationId: z.string().min(1),
  newPriceId: z.string().min(1),
  effectiveDate: z.enum(['immediate', 'end_of_period']).default('end_of_period'),
})

// POST /api/subscriptions/upgrade
export async function POST(request: NextRequest) {
  return withAuth(async (user) => {
    try {
      const body = await request.json()
      const { organizationId, newPriceId, billingCycle } = UpgradeRequestSchema.parse(body)

      // Verify organization ownership/admin access
      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId,
          userId: user.id,
          role: { in: ['OWNER', 'ADMIN'] },
          status: 'ACTIVE',
        },
      })

      if (!member) {
        return NextResponse.json(
          { error: 'Access denied. Organization admin required.' },
          { status: 403 }
        )
      }

      // Get current subscription
      const currentSubscription = await SubscriptionService.getSubscription(organizationId)

      if (!currentSubscription) {
        return NextResponse.json(
          { error: 'No active subscription found' },
          { status: 404 }
        )
      }

      // Get target plan details
      const newPlan = await SubscriptionService.getPlanByPriceId(newPriceId)
      if (!newPlan) {
        return NextResponse.json(
          { error: 'Invalid plan selected' },
          { status: 400 }
        )
      }

      // Validate upgrade path (prevent downgrades through upgrade endpoint)
      if (newPlan.amount <= (currentSubscription.plan?.amount || 0)) {
        return NextResponse.json(
          { error: 'Use downgrade endpoint for plan downgrades' },
          { status: 400 }
        )
      }

      // Check for usage violations that would prevent upgrade
      const limitCheck = await SubscriptionService.checkLimits(organizationId)
      if (limitCheck.hasViolations) {
        return NextResponse.json(
          {
            error: 'Current usage exceeds new plan limits',
            violations: limitCheck.violations,
            currentUsage: limitCheck.usage,
            newLimits: newPlan.features,
          },
          { status: 402 }
        )
      }

      // Handle immediate upgrade via Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(
        currentSubscription.subscriptionId
      )

      // Update subscription item to new price
      const updatedStripeSubscription = await stripe.subscriptions.update(
        stripeSubscription.id,
        {
          items: [
            {
              id: stripeSubscription.items.data[0].id,
              price: newPriceId,
            },
          ],
          proration_behavior: 'create_prorations', // Pro-rate charges
          billing_cycle_anchor: billingCycle === 'YEARLY' ? 'now' : undefined,
        }
      )

      // Update local subscription record
      const updatedSubscription = await SubscriptionService.updateSubscription(
        currentSubscription.subscriptionId,
        {
          status: updatedStripeSubscription.status as any,
          currentPeriodStart: new Date(updatedStripeSubscription.current_period_start * 1000),
          currentPeriodEnd: new Date(updatedStripeSubscription.current_period_end * 1000),
        }
      )

      // Update plan association
      await prisma.subscription.update({
        where: { id: updatedSubscription.id },
        data: { planId: newPlan.id },
      })

      // Log upgrade event
      await prisma.usageRecord.create({
        data: {
          metric: 'subscription_upgrade',
          quantity: 1,
          metadata: {
            fromPlan: currentSubscription.plan?.name,
            toPlan: newPlan.name,
            upgradeType: 'immediate',
          },
          timestamp: new Date(),
        },
      })

      return NextResponse.json({
        subscription: updatedSubscription,
        plan: newPlan,
        message: 'Subscription upgraded successfully',
        billingDetails: {
          proratedAmount: calculateProration(currentSubscription, newPlan),
          nextBillingDate: new Date(updatedStripeSubscription.current_period_end * 1000),
        },
      })

    } catch (error) {
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          { error: 'Invalid request data', details: error.issues },
          { status: 400 }
        )
      }

      if (error instanceof Stripe.errors.StripeError) {
        logError('stripe-upgrade-error', error, { userId: user.id, organizationId })
        return NextResponse.json(
          { error: 'Payment processing failed', details: error.message },
          { status: 402 }
        )
      }

      logError('subscription-upgrade-error', error, { userId: user.id })
      return NextResponse.json(
        { error: 'Failed to upgrade subscription' },
        { status: 500 }
      )
    }
  })(request)
}

// POST /api/subscriptions/downgrade
export async function PUT(request: NextRequest) {
  return withAuth(async (user) => {
    try {
      const body = await request.json()
      const { organizationId, newPriceId, effectiveDate } = DowngradeRequestSchema.parse(body)

      // Verify organization ownership
      const member = await prisma.organizationMember.findFirst({
        where: {
          organizationId,
          userId: user.id,
          role: 'OWNER', // Only owners can downgrade
          status: 'ACTIVE',
        },
      })

      if (!member) {
        return NextResponse.json(
          { error: 'Access denied. Organization owner required.' },
          { status: 403 }
        )
      }

      const currentSubscription = await SubscriptionService.getSubscription(organizationId)
      const newPlan = await SubscriptionService.getPlanByPriceId(newPriceId)

      if (!currentSubscription || !newPlan) {
        return NextResponse.json(
          { error: 'Subscription or plan not found' },
          { status: 404 }
        )
      }

      // Check if current usage fits in new plan limits
      const usage = await SubscriptionService.getCurrentUsage(organizationId)
      const newPlanFeatures = newPlan.features as any

      const violations: string[] = []
      if (newPlanFeatures.maxUsers !== -1 && usage.users > newPlanFeatures.maxUsers) {
        violations.push(`User count (${usage.users}) exceeds new limit (${newPlanFeatures.maxUsers})`)
      }
      if (newPlanFeatures.maxProjects !== -1 && usage.projects > newPlanFeatures.maxProjects) {
        violations.push(`Project count (${usage.projects}) exceeds new limit (${newPlanFeatures.maxProjects})`)
      }

      if (violations.length > 0) {
        return NextResponse.json({
          error: 'Cannot downgrade due to usage violations',
          violations,
          currentUsage: usage,
          newLimits: newPlanFeatures,
          suggestions: [
            'Remove excess users or projects before downgrading',
            'Contact support for migration assistance',
          ],
        }, { status: 409 })
      }

      // Handle downgrade based on effective date
      if (effectiveDate === 'immediate') {
        // Immediate downgrade with credit calculation
        const stripeSubscription = await stripe.subscriptions.update(
          currentSubscription.subscriptionId,
          {
            items: [
              {
                id: (await stripe.subscriptions.retrieve(currentSubscription.subscriptionId)).items.data[0].id,
                price: newPriceId,
              },
            ],
            proration_behavior: 'create_prorations',
          }
        )

        await SubscriptionService.updateSubscription(currentSubscription.subscriptionId, {
          status: stripeSubscription.status as any,
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        })

        return NextResponse.json({
          message: 'Subscription downgraded immediately',
          creditAmount: calculateCredit(currentSubscription, newPlan),
        })

      } else {
        // Schedule downgrade for end of period
        await stripe.subscriptions.update(currentSubscription.subscriptionId, {
          cancel_at_period_end: false, // Ensure it doesn't cancel
          items: [
            {
              id: (await stripe.subscriptions.retrieve(currentSubscription.subscriptionId)).items.data[0].id,
              price: newPriceId,
            },
          ],
          proration_behavior: 'none', // No proration for end-of-period changes
        })

        // Store pending change
        await prisma.subscription.update({
          where: { id: currentSubscription.id },
          data: {
            metadata: {
              pendingDowngrade: {
                newPriceId,
                effectiveDate: currentSubscription.currentPeriodEnd,
                scheduledAt: new Date(),
              },
            },
          },
        })

        return NextResponse.json({
          message: 'Downgrade scheduled for end of billing period',
          effectiveDate: currentSubscription.currentPeriodEnd,
          newPlan: newPlan.name,
        })
      }

    } catch (error) {
      logError('subscription-downgrade-error', error, { userId: user.id })
      return NextResponse.json(
        { error: 'Failed to process downgrade' },
        { status: 500 }
      )
    }
  })(request)
}

// Helper functions
function calculateProration(currentSubscription: any, newPlan: any): number {
  const daysRemaining = Math.ceil(
    (currentSubscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const totalDaysInPeriod = Math.ceil(
    (currentSubscription.currentPeriodEnd.getTime() - currentSubscription.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
  )

  const currentPlanDaily = (currentSubscription.plan?.amount || 0) / totalDaysInPeriod
  const newPlanDaily = newPlan.amount / totalDaysInPeriod
  const proratedDifference = (newPlanDaily - currentPlanDaily) * daysRemaining

  return Math.max(0, proratedDifference)
}

function calculateCredit(currentSubscription: any, newPlan: any): number {
  const daysRemaining = Math.ceil(
    (currentSubscription.currentPeriodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  const totalDaysInPeriod = Math.ceil(
    (currentSubscription.currentPeriodEnd.getTime() - currentSubscription.currentPeriodStart.getTime()) / (1000 * 60 * 60 * 24)
  )

  const currentPlanDaily = (currentSubscription.plan?.amount || 0) / totalDaysInPeriod
  const newPlanDaily = newPlan.amount / totalDaysInPeriod
  const creditAmount = (currentPlanDaily - newPlanDaily) * daysRemaining

  return Math.max(0, creditAmount)
}

/**
 * Client-side usage example:
 *
 * // Upgrade subscription
 * const upgradeSubscription = async (organizationId: string, newPriceId: string) => {
 *   try {
 *     const response = await fetch('/api/subscriptions/upgrade', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         organizationId,
 *         newPriceId,
 *         billingCycle: 'MONTHLY'
 *       })
 *     })
 *
 *     if (!response.ok) {
 *       const error = await response.json()
 *       throw new Error(error.message || 'Upgrade failed')
 *     }
 *
 *     const result = await response.json()
 *     console.log('Upgrade successful:', result)
 *     return result
 *   } catch (error) {
 *     console.error('Upgrade error:', error)
 *     throw error
 *   }
 * }
 *
 * // Downgrade subscription
 * const downgradeSubscription = async (organizationId: string, newPriceId: string) => {
 *   try {
 *     const response = await fetch('/api/subscriptions/downgrade', {
 *       method: 'PUT',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({
 *         organizationId,
 *         newPriceId,
 *         effectiveDate: 'end_of_period'
 *       })
 *     })
 *
 *     const result = await response.json()
 *     if (!response.ok) throw new Error(result.error)
 *
 *     return result
 *   } catch (error) {
 *     console.error('Downgrade error:', error)
 *     throw error
 *   }
 * }
 */