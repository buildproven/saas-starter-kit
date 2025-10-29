import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { SubscriptionService } from '@/lib/subscription'
import { prisma } from '@/lib/prisma'
import { SubscriptionStatus } from '@prisma/client'

// Webhook event types
interface WebhookEvent {
  type: string
  data: {
    object: {
      id: string
      customer: string
      status: string
      items: {
        data: Array<{
          price: {
            id: string
          }
        }>
      }
      current_period_start: number
      current_period_end: number
      cancel_at_period_end: boolean
    }
  }
}

// Map Stripe status to our enum
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

// Validate webhook signature (simplified - in production use proper crypto verification)
function validateWebhookSignature(_request: NextRequest): boolean {
  try {
    const headersList = headers()
    const signature = headersList.get('stripe-signature') || headersList.get('webhook-signature')
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET

    if (!signature || !webhookSecret) {
      console.error('Missing webhook signature or secret')
      return false
    }

    // In production, implement proper signature validation
    // For now, just check if signature exists
    return signature.length > 0
  } catch (error) {
    console.error('Webhook signature validation error:', error)
    return false
  }
}

// POST /api/webhooks/subscription - Handle subscription webhook events
export async function POST(request: NextRequest) {
  try {
    // Validate webhook signature
    if (!validateWebhookSignature(request)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const body: WebhookEvent = await request.json()

    console.log('Received webhook event:', body.type)

    switch (body.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdate(body)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionCancellation(body)
        break

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(body)
        break

      case 'invoice.payment_failed':
        await handlePaymentFailed(body)
        break

      default:
        console.log(`Unhandled webhook event type: ${body.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook processing error:', error)
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    )
  }
}

async function handleSubscriptionUpdate(event: WebhookEvent) {
  try {
    const subscription = event.data.object
    const priceId = subscription.items.data[0]?.price.id

    if (!priceId) {
      console.error('No price ID found in subscription')
      return
    }

    // Find organization by customer ID
    const existingSubscription = await prisma.subscription.findFirst({
      where: { customerId: subscription.customer },
      include: { organization: true },
    })

    if (existingSubscription) {
      // Update existing subscription
      await SubscriptionService.updateSubscription(subscription.id, {
        status: mapSubscriptionStatus(subscription.status),
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      })

      console.log(`Updated subscription ${subscription.id} for organization ${existingSubscription.organization.name}`)
    } else {
      // This is a new subscription, but we need organization context
      // In practice, you'd store organization ID during checkout
      console.warn(`No existing subscription found for customer ${subscription.customer}`)
    }
  } catch (error) {
    console.error('Error handling subscription update:', error)
    throw error
  }
}

async function handleSubscriptionCancellation(event: WebhookEvent) {
  try {
    const subscription = event.data.object

    await SubscriptionService.updateSubscription(subscription.id, {
      status: 'CANCELED',
    })

    console.log(`Cancelled subscription ${subscription.id}`)
  } catch (error) {
    console.error('Error handling subscription cancellation:', error)
    throw error
  }
}

async function handlePaymentSucceeded(event: WebhookEvent) {
  try {
    // Payment succeeded, ensure subscription is active
    const subscription = event.data.object

    await SubscriptionService.updateSubscription(subscription.id, {
      status: 'ACTIVE',
    })

    console.log(`Payment succeeded for subscription ${subscription.id}`)
  } catch (error) {
    console.error('Error handling payment success:', error)
    throw error
  }
}

async function handlePaymentFailed(event: WebhookEvent) {
  try {
    // Payment failed, mark subscription as past due
    const subscription = event.data.object

    await SubscriptionService.updateSubscription(subscription.id, {
      status: 'PAST_DUE',
    })

    console.log(`Payment failed for subscription ${subscription.id}`)

    // TODO: Send notification to organization admins
    // TODO: Implement grace period logic
  } catch (error) {
    console.error('Error handling payment failure:', error)
    throw error
  }
}