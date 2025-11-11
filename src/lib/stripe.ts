import Stripe from 'stripe'

const STRIPE_API_VERSION: Stripe.LatestApiVersion = '2024-06-20'

let stripeClient: Stripe | null = null

export function getStripeClient(): Stripe {
  if (stripeClient) {
    return stripeClient
  }

  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error(
      'Stripe is not configured. Set STRIPE_SECRET_KEY in your environment before invoking billing operations.'
    )
  }

  stripeClient = new Stripe(secretKey, {
    apiVersion: STRIPE_API_VERSION,
    timeout: 30000, // 30 second timeout
    maxNetworkRetries: 2, // Stripe's built-in retry
  })

  return stripeClient
}

export type StripeClient = Stripe
