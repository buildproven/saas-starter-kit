import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  // Skip Prisma initialization during build if no valid DATABASE_URL
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.DATABASE_URL ||
      process.env.DATABASE_URL.includes('localhost') ||
      process.env.DATABASE_URL.includes('user:password'))
  ) {
    // Return a proxy that throws helpful errors during build
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

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
