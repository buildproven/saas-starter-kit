/**
 * Seed script to synchronize pricing plans with Stripe products/prices.
 * Run with: npx tsx scripts/seed-plans.ts
 */

import { Prisma, PrismaClient, PlanInterval } from '@prisma/client'
import type Stripe from 'stripe'
import { PLAN_CONFIGS } from '../src/lib/subscription'
import { getStripeClient } from '../src/lib/stripe'
import {
  PLAN_VARIANTS,
  getPlanLabel,
  getPriceIdFromEnv,
  type BillingIntervalSlug,
} from '../src/lib/billing/plan-definitions'

interface PlanSeed {
  name: string
  description: string
  priceId: string
  productId: string
  amount: number
  currency: string
  interval: PlanInterval
  features: Prisma.JsonObject
  isActive: boolean
}

const serializeFeatures = (plan: keyof typeof PLAN_CONFIGS) =>
  PLAN_CONFIGS[plan] as unknown as Prisma.JsonObject

const toInterval = (interval: BillingIntervalSlug): PlanInterval =>
  interval === 'year' ? 'YEAR' : 'MONTH'

const requirePriceId = (envName: string): string => {
  const value = getPriceIdFromEnv(envName)
  if (!value) {
    throw new Error(`Missing required environment variable: ${envName}`)
  }
  return value
}

const isDeletedProduct = (
  product: Stripe.Product | Stripe.DeletedProduct
): product is Stripe.DeletedProduct => 'deleted' in product && product.deleted === true

async function buildPlanSeeds(): Promise<PlanSeed[]> {
  const stripe = getStripeClient()
  const seeds: PlanSeed[] = []

  for (const variant of PLAN_VARIANTS) {
    const priceId = requirePriceId(variant.priceEnv)

    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product'],
    })

    if (!price.unit_amount || !price.currency || !price.recurring) {
      throw new Error(
        `Price ${priceId} must be a recurring price with a fixed unit amount and currency.`
      )
    }

    const productRecord =
      typeof price.product === 'string'
        ? await stripe.products.retrieve(price.product)
        : price.product

    if (isDeletedProduct(productRecord)) {
      throw new Error(`Stripe product ${productRecord.id} is deleted. Restore or update pricing before seeding.`)
    }

    const productName = productRecord.name || getPlanLabel(variant.tier)
    const displayName = `${productName} (${variant.interval === 'year' ? 'Yearly' : 'Monthly'})`

    seeds.push({
      name: displayName,
      description: productRecord.description ?? `${productName} subscription`,
      priceId: price.id,
      productId: productRecord.id,
      amount: price.unit_amount,
      currency: price.currency,
      interval: toInterval(variant.interval),
      features: serializeFeatures(variant.tier),
      isActive: Boolean(productRecord.active && price.active),
    })
  }

  return seeds
}

export async function seedPlans(passedPrisma?: PrismaClient) {
  console.log('🌱 Seeding Stripe-backed subscription plans...')

  const prisma = passedPrisma ?? new PrismaClient()

  try {
    const planSeeds = await buildPlanSeeds()

    for (const planData of planSeeds) {
      await prisma.plan.upsert({
        where: { priceId: planData.priceId },
        update: {
          name: planData.name,
          description: planData.description,
          amount: planData.amount,
          currency: planData.currency,
          interval: planData.interval,
          features: planData.features,
          isActive: planData.isActive,
          productId: planData.productId,
        },
        create: planData,
      })

      console.log(`✔ Plan synced: ${planData.name} (${planData.priceId})`)
    }

    // Display summary
    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { amount: 'asc' },
    })

    console.log('\n📋 Active Plans:')
    plans.forEach((plan) => {
      const price = (plan.amount / 100).toFixed(2)
      const interval = plan.interval.toLowerCase()
      console.log(`  • ${plan.name} - $${price}/${interval} [${plan.priceId}]`)
    })

    console.log('\n✅ Successfully synchronized plans with Stripe pricing')
  } catch (error) {
    console.error('❌ Failed to seed plans:', error)
    process.exit(1)
  } finally {
    if (!passedPrisma) {
      await prisma.$disconnect()
    }
  }
}

if (require.main === module) {
  seedPlans()
}
