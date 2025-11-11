import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { SubscriptionStatus } from '@prisma/client'
import { SubscriptionService } from '@/lib/subscription'
import { logger } from '@/lib/logger'
import { webhookEvents, webhookProcessingDuration } from '@/lib/metrics'

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
    logger.warn(
      { subscriptionId: subscription.id, type: 'webhook.subscription.missing_price' },
      'Subscription missing price ID'
    )
    return
  }

  const existingPlan = await prisma.plan.findUnique({ where: { priceId } })
  if (!existingPlan) {
    logger.warn(
      { priceId, type: 'webhook.subscription.price_not_found' },
      'Price not found in plan table'
    )
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
    logger.error(
      {
        subscriptionId: subscription.id,
        customerId,
        type: 'webhook.subscription.org_not_found',
      },
      'Unable to resolve organization for subscription'
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
    logger.warn(
      {
        subscriptionId: subscription.id,
        type: 'webhook.subscription.cancel_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Cancel update skipped'
    )
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rawBody = await request.text()
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!signature || !webhookSecret) {
    webhookEvents.inc({ event_type: 'unknown', status: 'rejected' })
    return NextResponse.json({ error: 'Missing Stripe signature or secret' }, { status: 400 })
  }

  const stripe = getStripeClient()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)
  } catch (error) {
    logger.error(
      {
        type: 'webhook.signature_verification_failed',
        error: error instanceof Error ? error.message : String(error),
      },
      'Stripe webhook signature verification failed'
    )
    webhookEvents.inc({ event_type: 'unknown', status: 'invalid_signature' })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    const shouldProcess = await recordEvent(event.id)
    if (!shouldProcess) {
      logger.info(
        { eventId: event.id, eventType: event.type, type: 'webhook.duplicate' },
        'Webhook event already processed, skipping'
      )
      webhookEvents.inc({ event_type: event.type, status: 'duplicate' })
      return NextResponse.json({ received: true, cached: true })
    }

    logger.info(
      { eventId: event.id, eventType: event.type, type: 'webhook.processing' },
      'Processing webhook event'
    )

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
            logger.warn(
              {
                subscriptionId: invoice.subscription,
                invoiceId: invoice.id,
                type: 'webhook.invoice.payment_succeeded.update_failed',
                error: err instanceof Error ? err.message : String(err),
              },
              'Unable to mark subscription active'
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
            logger.warn(
              {
                subscriptionId: invoice.subscription,
                invoiceId: invoice.id,
                type: 'webhook.invoice.payment_failed.update_failed',
                error: err instanceof Error ? err.message : String(err),
              },
              'Unable to mark subscription past due'
            )
          }
        }
        break
      }

      default:
        // Unhandled event types can be logged for visibility
        logger.info(
          { eventType: event.type, eventId: event.id, type: 'webhook.unhandled' },
          'Received unhandled webhook event type'
        )
    }

    const duration = (Date.now() - startTime) / 1000
    webhookEvents.inc({ event_type: event.type, status: 'success' })
    webhookProcessingDuration.observe({ event_type: event.type }, duration)

    logger.info(
      { eventId: event.id, eventType: event.type, duration, type: 'webhook.completed' },
      'Webhook event processed successfully'
    )

    return NextResponse.json({ received: true })
  } catch (error) {
    const duration = (Date.now() - startTime) / 1000
    logger.error(
      {
        eventId: event?.id,
        eventType: event?.type,
        duration,
        type: 'webhook.processing_error',
        error: error instanceof Error ? error.message : String(error),
      },
      'Stripe webhook processing error'
    )
    webhookEvents.inc({ event_type: event?.type || 'unknown', status: 'error' })
    webhookProcessingDuration.observe({ event_type: event?.type || 'unknown' }, duration)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
