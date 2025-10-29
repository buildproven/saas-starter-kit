/**
 * Billing integration utilities for Stripe
 * This is a foundation that can be extended with actual Stripe SDK integration
 */

export interface BillingCustomer {
  id: string
  email: string
  name?: string
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
}

export interface PortalSessionParams {
  customerId: string
  returnUrl: string
}

export class BillingService {
  private static baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  /**
   * Create a new customer in the billing system
   */
  static async createCustomer(params: {
    email: string
    name?: string
    organizationId: string
  }): Promise<BillingCustomer> {
    // In production, this would call Stripe's API
    // For now, return mock data
    return {
      id: `cus_${Math.random().toString(36).substr(2, 9)}`,
      email: params.email,
      name: params.name,
      organizationId: params.organizationId,
    }
  }

  /**
   * Create a checkout session for subscription
   */
  static async createCheckoutSession(params: CheckoutSessionParams): Promise<{ url: string }> {
    // In production, this would call Stripe's API
    // For now, return mock checkout URL
    const checkoutUrl = `${this.baseUrl}/api/billing/checkout?priceId=${params.priceId}&organizationId=${params.organizationId}`

    return {
      url: checkoutUrl,
    }
  }

  /**
   * Create a customer portal session for subscription management
   */
  static async createPortalSession(params: PortalSessionParams): Promise<{ url: string }> {
    // In production, this would call Stripe's API
    // For now, return mock portal URL
    const portalUrl = `${this.baseUrl}/api/billing/portal?customerId=${params.customerId}&returnUrl=${encodeURIComponent(params.returnUrl)}`

    return {
      url: portalUrl,
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(subscriptionId: string): Promise<BillingSubscription> {
    // In production, this would call Stripe's API
    // For now, return mock data
    return {
      id: subscriptionId,
      customerId: 'cus_mock',
      priceId: 'price_mock',
      status: 'canceled',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: true,
    }
  }

  /**
   * Update subscription (change plan, quantity, etc.)
   */
  static async updateSubscription(
    subscriptionId: string,
    params: {
      priceId?: string
      quantity?: number
    }
  ): Promise<BillingSubscription> {
    // In production, this would call Stripe's API
    // For now, return mock data
    return {
      id: subscriptionId,
      customerId: 'cus_mock',
      priceId: params.priceId || 'price_mock',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    }
  }

  /**
   * Get subscription details
   */
  static async getSubscription(subscriptionId: string): Promise<BillingSubscription | null> {
    // In production, this would call Stripe's API
    // For now, return mock data
    return {
      id: subscriptionId,
      customerId: 'cus_mock',
      priceId: 'price_mock',
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    }
  }

  /**
   * Validate webhook event signature
   */
  static validateWebhookSignature(payload: string, signature: string, secret: string): boolean {
    // In production, implement proper Stripe signature validation
    // For now, basic validation
    return signature.length > 0 && secret.length > 0
  }

  /**
   * Generate invoice preview for plan change
   */
  static async previewInvoice(params: {
    customerId: string
    newPriceId: string
    currentSubscriptionId: string
  }): Promise<{
    amountDue: number
    currency: string
    lineItems: Array<{
      description: string
      amount: number
    }>
  }> {
    // In production, this would call Stripe's API
    // For now, return mock invoice preview
    return {
      amountDue: 1500, // $15.00 in cents
      currency: 'usd',
      lineItems: [
        {
          description: 'Proration for plan change',
          amount: 1500,
        },
      ],
    }
  }

  /**
   * Get usage record for metered billing
   */
  static async recordUsage(_params: {
    subscriptionItemId: string
    quantity: number
    timestamp?: Date
  }): Promise<void> {
    // In production, this would call Stripe's usage record API
    // console.log('Usage recorded:', params)
  }

  /**
   * Get customer's payment methods
   */
  static async getPaymentMethods(_customerId: string): Promise<Array<{
    id: string
    type: string
    card?: {
      brand: string
      last4: string
      expMonth: number
      expYear: number
    }
  }>> {
    // In production, this would call Stripe's API
    // For now, return mock payment methods
    return [
      {
        id: 'pm_mock',
        type: 'card',
        card: {
          brand: 'visa',
          last4: '4242',
          expMonth: 12,
          expYear: 2025,
        },
      },
    ]
  }

  /**
   * Create setup intent for adding new payment method
   */
  static async createSetupIntent(_customerId: string): Promise<{
    clientSecret: string
  }> {
    // In production, this would call Stripe's API
    // For now, return mock setup intent
    return {
      clientSecret: 'seti_mock_client_secret',
    }
  }

  /**
   * Get upcoming invoice
   */
  static async getUpcomingInvoice(_customerId: string): Promise<{
    amountDue: number
    currency: string
    periodEnd: Date
    nextPaymentAttempt: Date
  } | null> {
    // In production, this would call Stripe's API
    // For now, return mock upcoming invoice
    return {
      amountDue: 2900, // $29.00 in cents
      currency: 'usd',
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nextPaymentAttempt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }
  }

  /**
   * Helper to format amount for display
   */
  static formatAmount(amount: number, currency: string = 'usd'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100)
  }

  /**
   * Helper to get plan display name from price ID
   */
  static getPlanDisplayName(priceId: string): string {
    const planNames: Record<string, string> = {
      'price_starter_monthly': 'Starter Plan (Monthly)',
      'price_starter_yearly': 'Starter Plan (Yearly)',
      'price_pro_monthly': 'Pro Plan (Monthly)',
      'price_pro_yearly': 'Pro Plan (Yearly)',
      'price_enterprise_monthly': 'Enterprise Plan (Monthly)',
      'price_enterprise_yearly': 'Enterprise Plan (Yearly)',
    }

    return planNames[priceId] || 'Unknown Plan'
  }

  /**
   * Check if customer has valid payment method
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