/**
 * Template Sales Checkout API
 *
 * Handles payment processing for selling the SaaS starter template itself.
 * Separate from the template's internal billing system.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { getStripeClient } from '@/lib/stripe'
import { logError, ErrorType } from '@/lib/error-logging'
import { fulfillTemplateSale } from '@/lib/template-sales/fulfillment'

// Helper function to check if template sales are configured
function isTemplateSalesConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_TEMPLATE_BASIC_PRICE_ID &&
    process.env.STRIPE_TEMPLATE_PRO_PRICE_ID &&
    process.env.STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID
  )
}

// Template sales packages
const TEMPLATE_PACKAGES = {
  basic: {
    name: 'SaaS Starter Template - Basic',
    price: 29900, // $299
    priceId: process.env.STRIPE_TEMPLATE_BASIC_PRICE_ID!,
    features: [
      'Complete Next.js 14 SaaS template',
      'Authentication & authorization',
      'Multi-tenant architecture',
      'Basic billing integration',
      'Documentation & examples',
      'Email support',
    ],
  },
  pro: {
    name: 'SaaS Starter Template - Pro',
    price: 59900, // $599
    priceId: process.env.STRIPE_TEMPLATE_PRO_PRICE_ID!,
    features: [
      'Everything in Basic',
      'Advanced billing features',
      'White-label customization',
      'Video tutorials',
      'Priority support',
      '1-hour consultation call',
    ],
  },
  enterprise: {
    name: 'SaaS Starter Template - Enterprise',
    price: 149900, // $1,499
    priceId: process.env.STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID!,
    features: [
      'Everything in Pro',
      'Custom deployment setup',
      'Team training session',
      'Extended support (6 months)',
      'Custom integrations',
      'Source code modifications',
    ],
  },
}

const CheckoutRequestSchema = z.object({
  package: z.enum(['basic', 'pro', 'enterprise']),
  email: z.string().email(),
  companyName: z.string().optional(),
  useCase: z.string().optional(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

// POST /api/template-sales/checkout
export async function POST(request: NextRequest) {
  try {
    // Check if template sales are configured
    if (!isTemplateSalesConfigured()) {
      return NextResponse.json(
        {
          error: 'Template sales not configured',
          details: 'Please configure Stripe template pricing environment variables',
        },
        { status: 501 }
      )
    }

    const body = await request.json()
    const validatedData = CheckoutRequestSchema.parse(body)

    const selectedPackage = TEMPLATE_PACKAGES[validatedData.package]
    if (!selectedPackage) {
      return NextResponse.json({ error: 'Invalid package selected' }, { status: 400 })
    }

    // Create Stripe checkout session
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price: selectedPackage.priceId,
          quantity: 1,
        },
      ],
      customer_email: validatedData.email,
      metadata: {
        package: validatedData.package,
        companyName: validatedData.companyName || '',
        useCase: validatedData.useCase || '',
        templateSale: 'true',
      },
      success_url:
        validatedData.successUrl ||
        `${process.env.NEXT_PUBLIC_APP_URL}/template-purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:
        validatedData.cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/template-purchase/cancel`,
      allow_promotion_codes: true,
      tax_id_collection: {
        enabled: true,
      },
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Purchase of ${selectedPackage.name}`,
          metadata: {
            package: validatedData.package,
            templateSale: 'true',
          },
        },
      },
    })

    // Store the checkout session for tracking
    await prisma.templateSale.create({
      data: {
        sessionId: session.id,
        email: validatedData.email,
        package: validatedData.package,
        amount: selectedPackage.price,
        status: 'PENDING',
        companyName: validatedData.companyName,
        useCase: validatedData.useCase,
        metadata: {
          stripeSessionId: session.id,
          packageDetails: selectedPackage,
        },
      },
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
      package: selectedPackage,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    if (error instanceof Stripe.errors.StripeError) {
      logError(error, ErrorType.PAYMENT)
      return NextResponse.json(
        { error: 'Payment processing failed', details: error.message },
        { status: 402 }
      )
    }

    const unknownError = error instanceof Error ? error : new Error(String(error))
    logError(unknownError, ErrorType.SYSTEM)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}

// GET /api/template-sales/checkout - Verify completed purchase
export async function GET(request: NextRequest) {
  try {
    // Check if template sales are configured
    if (!isTemplateSalesConfigured()) {
      return NextResponse.json(
        {
          error: 'Template sales not configured',
          details: 'Please configure Stripe template pricing environment variables',
        },
        { status: 501 }
      )
    }

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    // Retrieve the checkout session from Stripe
    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer_details'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    // Update our record
    const templateSale = await prisma.templateSale.findUnique({
      where: { sessionId },
    })

    if (!templateSale) {
      return NextResponse.json({ error: 'Sale record not found' }, { status: 404 })
    }

    // Update status and add payment details
    const updatedSale = await prisma.templateSale.update({
      where: { sessionId },
      data: {
        status: 'COMPLETED',
        paymentIntentId: session.payment_intent as string,
        completedAt: new Date(),
        customerDetails: {
          email: session.customer_details?.email,
          name: session.customer_details?.name,
          address: session.customer_details?.address
            ? {
                line1: session.customer_details.address.line1,
                line2: session.customer_details.address.line2,
                city: session.customer_details.address.city,
                state: session.customer_details.address.state,
                postal_code: session.customer_details.address.postal_code,
                country: session.customer_details.address.country,
              }
            : null,
          phone: session.customer_details?.phone,
        },
      },
    })

    let fulfillmentSummary: Awaited<ReturnType<typeof fulfillTemplateSale>> | null = null

    try {
      fulfillmentSummary = await fulfillTemplateSale({
        sessionId,
        customerEmail: session.customer_details?.email || updatedSale.email,
        package: updatedSale.package as 'basic' | 'pro' | 'enterprise',
        customerName: session.customer_details?.name,
        companyName: session.customer_details?.name || updatedSale.companyName || undefined,
      })
    } catch (fulfillmentError) {
      logError(fulfillmentError as Error, ErrorType.SYSTEM)
    }

    return NextResponse.json({
      sale: updatedSale,
      package: TEMPLATE_PACKAGES[updatedSale.package as keyof typeof TEMPLATE_PACKAGES],
      fulfillment: fulfillmentSummary,
    })
  } catch (error) {
    if (error instanceof Stripe.errors.StripeError) {
      logError(error, ErrorType.PAYMENT)
      return NextResponse.json({ error: 'Failed to verify payment with Stripe' }, { status: 402 })
    }

    const unknownError = error instanceof Error ? error : new Error(String(error))
    logError(unknownError, ErrorType.SYSTEM)
    return NextResponse.json({ error: 'Failed to verify purchase' }, { status: 500 })
  }
}

/**
 * Usage Examples:
 *
 * // Create checkout session
 * const response = await fetch('/api/template-sales/checkout', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     package: 'pro',
 *     email: 'customer@company.com',
 *     companyName: 'Acme Corp',
 *     useCase: 'Building internal tools platform'
 *   })
 * })
 *
 * const { url } = await response.json()
 * window.location.href = url // Redirect to Stripe Checkout
 *
 * // Verify purchase after successful payment
 * const verification = await fetch(`/api/template-sales/checkout?session_id=${sessionId}`)
 * const { sale, package, nextSteps } = await verification.json()
 */
