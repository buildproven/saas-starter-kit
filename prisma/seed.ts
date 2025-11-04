import { PrismaClient } from '@prisma/client'
import { seedPlans } from '../scripts/seed-plans'

const prisma = new PrismaClient()

async function main() {
  await seedPlans(prisma)
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
