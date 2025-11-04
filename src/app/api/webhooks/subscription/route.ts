import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { SubscriptionStatus } from '@prisma/client'
import { SubscriptionService } from '@/lib/subscription'

function mapSubscriptionStatus(stripeStatus: string): SubscriptionStatus {
  switch (stripeStatus.toLowerCase()) {
    case 'incomplete':
      return 'INCOMPLETE'
    case 'incomplete_expired':
      return 'INCOMPLETE_EXPIRED'
    case 'trialing':
      return 'TRIALING'
    case 'active':
      return 'ACTIVE'
    case 'past_due':
      return 'PAST_DUE'
    case 'canceled':
      return 'CANCELED'
    case 'unpaid':
      return 'UNPAID'
    default:
      return 'INCOMPLETE'
  }
}

async function recordEvent(eventId: string) {
  try {
    await prisma.stripeWebhookEvent.create({
      data: {
        eventId,
      },
    })
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return false
    }
    throw error
  }
}

async function upsertSubscription(subscription: Stripe.Subscription) {
  const price = subscription.items.data[0]?.price
  const priceId = typeof price === 'string' ? price : price?.id
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id

  if (!priceId) {
    console.warn('Stripe webhook: subscription missing price ID', subscription.id)
    return
  }

  const existingPlan = await prisma.plan.findUnique({ where: { priceId } })
  if (!existingPlan) {
    console.warn('Stripe webhook: price not found in plan table', priceId)
  }

  let organizationId = subscription.metadata?.organizationId

  if (!organizationId) {
    const existingRecord = await prisma.subscription.findUnique({
      where: { subscriptionId: subscription.id },
      select: { organizationId: true },
    })

    if (existingRecord) {
      organizationId = existingRecord.organizationId
    } else {
      const byCustomer = await prisma.subscription.findFirst({
        where: { customerId },
        select: { organizationId: true },
      })
      organizationId = byCustomer?.organizationId
    }
  }

  if (!organizationId) {
    console.error(
      'Stripe webhook: unable to resolve organization for subscription',
      subscription.id
    )
    return
  }

  const data = {
    customerId,
    priceId,
    status: mapSubscriptionStatus(subscription.status),
    currentPeriodStart: new Date(subscription.current_period_start * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  }

  await prisma.subscription.upsert({
    where: { subscriptionId: subscription.id },
    update: data,
    create: {
      subscriptionId: subscription.id,
      organizationId,
      ...data,
    },
  })
}

async function cancelSubscription(subscription: Stripe.Subscription) {
  try {
    await prisma.subscription.update({
      where: { subscriptionId: subscription.id },
      data: {
        status: 'CANCELED',
        cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
      },
    })
  } catch (error) {
    console.warn('Stripe webhook: cancel update skipped', subscription.id, error)
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing Stripe signature or secret' }, { status: 400 })
  }

  const stripe = getStripeClient()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('Stripe webhook signature verification failed', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const shouldProcess = await recordEvent(event.id)
    if (!shouldProcess) {
      return NextResponse.json({ received: true })
    }

    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await upsertSubscription(subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await cancelSubscription(subscription)
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        if (typeof invoice.subscription === 'string') {
          try {
            await SubscriptionService.updateSubscription(invoice.subscription, {
              status: 'ACTIVE',
            })
          } catch (err) {
            console.warn(
              'Stripe webhook: unable to mark subscription active',
              invoice.subscription,
              err
            )
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        if (typeof invoice.subscription === 'string') {
          try {
            await SubscriptionService.updateSubscription(invoice.subscription, {
              status: 'PAST_DUE',
            })
          } catch (err) {
            console.warn(
              'Stripe webhook: unable to mark subscription past due',
              invoice.subscription,
              err
            )
          }
        }
        break
      }

      default:
        // Unhandled event types can be logged for visibility
        console.info(`Stripe webhook received unhandled event: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook processing error', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
