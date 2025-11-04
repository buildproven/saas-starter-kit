import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/stripe'
import { getPlanNameByPriceId } from '@/lib/billing/plan-definitions'

const isStripeNotFoundError = (error: unknown): boolean => {
  return (
    !!error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (error as any).statusCode === 404
  )
}

export interface BillingCustomer {
  id: string
  email?: string | null
  name?: string | null
  organizationId: string
}

export interface BillingSubscription {
  id: string
  customerId: string
  priceId: string
  status: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  cancelAtPeriodEnd: boolean
}

export interface CheckoutSessionParams {
  customerId?: string
  priceId: string
  organizationId: string
  successUrl: string
  cancelUrl: string
  customerEmail?: string
  customerName?: string
}

export interface PortalSessionParams {
  customerId: string
  returnUrl: string
}

interface InvoicePreviewLineItem {
  description: string
  amount: number
}

export interface CheckoutSessionDetails {
  id: string
  status: Stripe.Checkout.Session.Status | null
  paymentStatus: Stripe.Checkout.Session.PaymentStatus | null
  customerEmail?: string | null
  subscriptionId?: string | null
  priceId?: string | null
}

export class BillingService {
  private static toBillingSubscription(subscription: Stripe.Subscription): BillingSubscription {
    const price = subscription.items.data[0]?.price

    return {
      id: subscription.id,
      customerId:
        typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
      priceId: price?.id ?? '',
      status: subscription.status,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    }
  }

  /**
   * Create or re-use a Stripe customer for the organization owner.
   */
  static async createCustomer(params: {
    email: string
    name?: string
    organizationId: string
  }): Promise<BillingCustomer> {
    const stripe = getStripeClient()

    const existingCustomers = await stripe.customers.list({
      email: params.email,
      limit: 5,
    })

    const matchedCustomer = existingCustomers.data.find(
      (customer) => customer.metadata?.organizationId === params.organizationId
    )

    if (matchedCustomer) {
      return {
        id: matchedCustomer.id,
        email: matchedCustomer.email,
        name: matchedCustomer.name,
        organizationId: params.organizationId,
      }
    }

    const customer = await stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        organizationId: params.organizationId,
      },
    })

    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      organizationId: params.organizationId,
    }
  }

  /**
   * Create a Stripe Checkout session for subscription purchase.
   */
  static async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    const stripe = getStripeClient()

    const baseSessionConfig: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      line_items: [
        {
          price: params.priceId,
          quantity: 1,
        },
      ],
      success_url: `${params.successUrl}${params.successUrl.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: params.cancelUrl,
      subscription_data: {
        metadata: {
          organizationId: params.organizationId,
          priceId: params.priceId,
        },
      },
      metadata: {
        organizationId: params.organizationId,
        priceId: params.priceId,
      },
    }

    // Add customer info based on whether we have an existing customer ID
    const sessionConfig: Stripe.Checkout.SessionCreateParams = params.customerId
      ? {
          ...baseSessionConfig,
          customer: params.customerId,
          // Don't set customer_creation when using existing customer
        }
      : {
          ...baseSessionConfig,
          customer_email: params.customerEmail,
          customer_creation: 'always',
        }

    const session = await stripe.checkout.sessions.create(sessionConfig)

    if (!session.url) {
      throw new Error('Stripe did not return a checkout session URL')
    }

    return { url: session.url }
  }

  /**
   * Retrieve checkout session details (for success page confirmation).
   */
  static async getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'line_items.data.price'],
    })

    // Try to get priceId from line items first, fall back to metadata
    let priceId: string | undefined

    const priceItem = session.line_items?.data?.[0]?.price
    if (priceItem) {
      priceId = typeof priceItem === 'string' ? priceItem : priceItem?.id
    }

    // Fallback to metadata if line items don't have the price
    if (!priceId && session.metadata?.priceId) {
      priceId = session.metadata.priceId
    }

    return {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      customerEmail: session.customer_details?.email ?? session.customer_email,
      subscriptionId: typeof session.subscription === 'string' ? session.subscription : session.subscription?.id,
      priceId,
    }
  }

  /**
   * Create a Billing Portal session for customer self-service.
   */
  static async createPortalSession(params: PortalSessionParams): Promise<{ url: string }> {
    const stripe = getStripeClient()

    const session = await stripe.billingPortal.sessions.create({
      customer: params.customerId,
      return_url: params.returnUrl,
    })

    return { url: session.url }
  }

  /**
   * Cancel a subscription at period end.
   */
  static async cancelSubscription(subscriptionId: string): Promise<BillingSubscription> {
    const stripe = getStripeClient()

    const subscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })

    return this.toBillingSubscription(subscription)
  }

  /**
   * Update subscription price or quantity.
   */
  static async updateSubscription(
    subscriptionId: string,
    params: {
      priceId?: string
      quantity?: number
      status?: Stripe.Subscription.Status
      currentPeriodStart?: Date
      currentPeriodEnd?: Date
      cancelAtPeriodEnd?: boolean
    }
  ): Promise<BillingSubscription> {
    const stripe = getStripeClient()
    const updateParams: Stripe.SubscriptionUpdateParams = {}

    if (params.priceId || params.quantity !== undefined) {
      const existing = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      })

      const primaryItem = existing.items.data[0]

      if (!primaryItem) {
        throw new Error(`Subscription ${subscriptionId} does not contain any items to update`)
      }

      updateParams.items = [
        {
          id: primaryItem.id,
          price: params.priceId ?? primaryItem.price?.id,
          quantity: params.quantity ?? primaryItem.quantity ?? 1,
        },
      ]
    }

    if (params.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = params.cancelAtPeriodEnd
    }

    const subscription = await stripe.subscriptions.update(subscriptionId, updateParams)
    return this.toBillingSubscription(subscription)
  }

  /**
   * Retrieve subscription details from Stripe.
   */
  static async getSubscription(subscriptionId: string): Promise<BillingSubscription | null> {
    const stripe = getStripeClient()

    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['items.data.price'],
      })
      return this.toBillingSubscription(subscription)
    } catch (error) {
      if (isStripeNotFoundError(error)) {
        return null
      }
      throw error
    }
  }

  /**
   * Validate a webhook signature using Stripe utilities.
   */
  static validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const stripe = getStripeClient()

    try {
      stripe.webhooks.constructEvent(payload, signature, secret)
      return true
    } catch (error) {
      console.error('Stripe webhook signature validation failed:', error)
      return false
    }
  }

  /**
   * Generate a pro-rated invoice preview when changing plans.
   */
  static async previewInvoice(params: {
    customerId: string
    newPriceId: string
    currentSubscriptionId: string
  }): Promise<{
    amountDue: number
    currency: string
    lineItems: InvoicePreviewLineItem[]
  }> {
    const stripe = getStripeClient()
    const subscription = await stripe.subscriptions.retrieve(params.currentSubscriptionId, {
      expand: ['items'],
    })

    const primaryItem = subscription.items.data[0]

    if (!primaryItem) {
      throw new Error(`Subscription ${params.currentSubscriptionId} does not contain billable items`)
    }

    const upcoming = await stripe.invoices.retrieveUpcoming({
      customer: params.customerId,
      subscription: params.currentSubscriptionId,
      subscription_items: [
        {
          id: primaryItem.id,
          price: params.newPriceId,
        },
      ],
    })

    return {
      amountDue: upcoming.amount_due ?? 0,
      currency: upcoming.currency ?? 'usd',
      lineItems: upcoming.lines.data.map((line) => ({
        description: line.description ?? 'Charge',
        amount: line.amount ?? 0,
      })),
    }
  }

  /**
   * Record usage for metered billing items.
   */
  static async recordUsage(params: {
    subscriptionItemId: string
    quantity: number
    timestamp?: Date
  }): Promise<void> {
    const stripe = getStripeClient()

    await stripe.subscriptionItems.createUsageRecord(params.subscriptionItemId, {
      quantity: params.quantity,
      timestamp: params.timestamp ? Math.floor(params.timestamp.getTime() / 1000) : undefined,
      action: 'increment',
    })
  }

  /**
   * Retrieve all active payment methods for a customer.
   */
  static async getPaymentMethods(customerId: string): Promise<
    Array<{
      id: string
      type: string
      card?: {
        brand: string
        last4: string
        expMonth: number
        expYear: number
      }
    }>
  > {
    const stripe = getStripeClient()

    const { data } = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
    })

    return data.map((paymentMethod) => ({
      id: paymentMethod.id,
      type: paymentMethod.type,
      card: paymentMethod.card
        ? {
            brand: paymentMethod.card.brand,
            last4: paymentMethod.card.last4,
            expMonth: paymentMethod.card.exp_month,
            expYear: paymentMethod.card.exp_year,
          }
        : undefined,
    }))
  }

  /**
   * Create a setup intent for storing a new payment method.
   */
  static async createSetupIntent(customerId: string): Promise<{ clientSecret: string }> {
    const stripe = getStripeClient()

    const intent = await stripe.setupIntents.create({
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    })

    return {
      clientSecret: intent.client_secret ?? '',
    }
  }

  /**
   * Retrieve the customer's upcoming invoice (if any).
   */
  static async getUpcomingInvoice(customerId: string): Promise<{
    amountDue: number
    currency: string
    periodEnd: Date
    nextPaymentAttempt: Date | null
  } | null> {
    const stripe = getStripeClient()

    try {
      const invoice = await stripe.invoices.retrieveUpcoming({
        customer: customerId,
      })

      return {
        amountDue: invoice.amount_due ?? 0,
        currency: invoice.currency ?? 'usd',
        periodEnd: invoice.period_end ? new Date(invoice.period_end * 1000) : new Date(),
        nextPaymentAttempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000)
          : null,
      }
    } catch (error) {
      if (isStripeNotFoundError(error)) {
        return null
      }

      throw error
    }
  }

  /**
   * Helper to format amount for display.
   */
  static formatAmount(amount: number, currency: string = 'usd'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100)
  }

  /**
   * Helper to map price ID to a friendly plan name using configured identifiers.
   */
  static getPlanDisplayName(priceId: string): string {
    const planName = getPlanNameByPriceId(priceId)
    return planName ?? 'Unknown Plan'
  }

  /**
   * Determine whether a customer has at least one payment method.
   */
  static async hasValidPaymentMethod(customerId: string): Promise<boolean> {
    try {
      const paymentMethods = await this.getPaymentMethods(customerId)
      return paymentMethods.length > 0
    } catch (error) {
      console.error('Error checking payment methods:', error)
      return false
    }
  }
}
