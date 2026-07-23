import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL

  if (
    !connectionString ||
    connectionString.includes('user:password') ||
    (process.env.NODE_ENV === 'production' && connectionString.includes('localhost'))
  ) {
    // Keep build-time route analysis independent of a database while making any
    // runtime query fail with an actionable configuration error.
    return new Proxy({} as PrismaClient, {
      get(_, prop) {
        if (prop === 'then') return undefined // Allow Promise resolution
        throw new Error(
          `Prisma client not available: DATABASE_URL not configured for production. ` +
            `Set a valid DATABASE_URL environment variable.`
        )
      },
    })
  }

  const adapter = new PrismaPg({ connectionString })

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
