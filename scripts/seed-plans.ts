/**
 * Seed script to populate default subscription plans
 * Run with: npx tsx scripts/seed-plans.ts
 */

import { PrismaClient, PlanInterval } from '@prisma/client'
import { PLAN_CONFIGS } from '../src/lib/subscription'

const prisma = new PrismaClient()

interface PlanSeed {
  name: string
  description: string
  priceId: string
  amount: number
  currency: string
  interval: PlanInterval
  features: typeof PLAN_CONFIGS[keyof typeof PLAN_CONFIGS]
  isActive: boolean
}

const plans: PlanSeed[] = [
  {
    name: 'Starter',
    description: 'Perfect for small teams getting started',
    priceId: 'price_starter_monthly',
    amount: 1900, // $19/month in cents
    currency: 'usd',
    interval: 'MONTH',
    features: PLAN_CONFIGS.starter,
    isActive: true,
  },
  {
    name: 'Starter (Yearly)',
    description: 'Perfect for small teams getting started - billed yearly',
    priceId: 'price_starter_yearly',
    amount: 19000, // $190/year in cents (2 months free)
    currency: 'usd',
    interval: 'YEAR',
    features: PLAN_CONFIGS.starter,
    isActive: true,
  },
  {
    name: 'Pro',
    description: 'Advanced features for growing businesses',
    priceId: 'price_pro_monthly',
    amount: 4900, // $49/month in cents
    currency: 'usd',
    interval: 'MONTH',
    features: PLAN_CONFIGS.pro,
    isActive: true,
  },
  {
    name: 'Pro (Yearly)',
    description: 'Advanced features for growing businesses - billed yearly',
    priceId: 'price_pro_yearly',
    amount: 49000, // $490/year in cents (2 months free)
    currency: 'usd',
    interval: 'YEAR',
    features: PLAN_CONFIGS.pro,
    isActive: true,
  },
  {
    name: 'Enterprise',
    description: 'Everything you need for large organizations',
    priceId: 'price_enterprise_monthly',
    amount: 9900, // $99/month in cents
    currency: 'usd',
    interval: 'MONTH',
    features: PLAN_CONFIGS.enterprise,
    isActive: true,
  },
  {
    name: 'Enterprise (Yearly)',
    description: 'Everything you need for large organizations - billed yearly',
    priceId: 'price_enterprise_yearly',
    amount: 99000, // $990/year in cents (2 months free)
    currency: 'usd',
    interval: 'YEAR',
    features: PLAN_CONFIGS.enterprise,
    isActive: true,
  },
]

async function seedPlans() {
  console.log('🌱 Seeding subscription plans...')

  try {
    for (const planData of plans) {
      const existingPlan = await prisma.plan.findUnique({
        where: { priceId: planData.priceId },
      })

      if (existingPlan) {
        console.log(`Plan "${planData.name}" already exists, updating...`)
        await prisma.plan.update({
          where: { priceId: planData.priceId },
          data: {
            name: planData.name,
            description: planData.description,
            amount: planData.amount,
            currency: planData.currency,
            interval: planData.interval,
            features: planData.features,
            isActive: planData.isActive,
          },
        })
      } else {
        console.log(`Creating plan "${planData.name}"...`)
        await prisma.plan.create({
          data: planData,
        })
      }
    }

    console.log('✅ Successfully seeded subscription plans!')

    // Display created plans
    const allPlans = await prisma.plan.findMany({
      orderBy: { amount: 'asc' },
    })

    console.log('\n📋 Available Plans:')
    allPlans.forEach((plan) => {
      const price = (plan.amount / 100).toFixed(2)
      const interval = plan.interval.toLowerCase()
      console.log(`  • ${plan.name} - $${price}/${interval} (${plan.priceId})`)
    })

  } catch (error) {
    console.error('❌ Error seeding plans:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

// Run the seed function
if (require.main === module) {
  seedPlans()
}