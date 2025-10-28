import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create sample plans
  const freePlan = await prisma.plan.upsert({
    where: { priceId: 'price_free' },
    update: {},
    create: {
      name: 'Free',
      description: 'Perfect for getting started',
      priceId: 'price_free',
      amount: 0,
      currency: 'usd',
      interval: 'MONTH',
      features: {
        apiCalls: 1000,
        storage: '1GB',
        projects: 1,
        support: 'community',
      },
      isActive: true,
    },
  })

  const proPlan = await prisma.plan.upsert({
    where: { priceId: 'price_pro' },
    update: {},
    create: {
      name: 'Pro',
      description: 'For growing teams and businesses',
      priceId: 'price_pro',
      amount: 2900, // $29.00 in cents
      currency: 'usd',
      interval: 'MONTH',
      features: {
        apiCalls: 100000,
        storage: '100GB',
        projects: 10,
        support: 'email',
        analytics: true,
      },
      isActive: true,
    },
  })

  const enterprisePlan = await prisma.plan.upsert({
    where: { priceId: 'price_enterprise' },
    update: {},
    create: {
      name: 'Enterprise',
      description: 'For large organizations',
      priceId: 'price_enterprise',
      amount: 9900, // $99.00 in cents
      currency: 'usd',
      interval: 'MONTH',
      features: {
        apiCalls: 'unlimited',
        storage: '1TB',
        projects: 'unlimited',
        support: 'priority',
        analytics: true,
        customIntegrations: true,
        sla: '99.9%',
      },
      isActive: true,
    },
  })

  console.log('Seeded plans:', { freePlan, proPlan, enterprisePlan })
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })