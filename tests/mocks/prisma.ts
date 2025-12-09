/**
 * Prisma Mock Types for Testing
 *
 * This module provides properly typed mocks for Prisma client methods.
 * Use these instead of casting `prisma as vi.Mocked<typeof prisma>`.
 */
import { vi } from 'vitest'

// Generic mock function type that includes all vitest mock methods
export type MockFn<T extends (...args: never[]) => unknown = (...args: unknown[]) => unknown> =
  ReturnType<typeof vi.fn<T>>

// Create a mock Prisma model with common methods
export function createMockPrismaModel<T = unknown>() {
  return {
    findUnique: vi.fn() as MockFn<() => Promise<T | null>>,
    findFirst: vi.fn() as MockFn<() => Promise<T | null>>,
    findMany: vi.fn() as MockFn<() => Promise<T[]>>,
    create: vi.fn() as MockFn<() => Promise<T>>,
    update: vi.fn() as MockFn<() => Promise<T>>,
    delete: vi.fn() as MockFn<() => Promise<T>>,
    upsert: vi.fn() as MockFn<() => Promise<T>>,
    count: vi.fn() as MockFn<() => Promise<number>>,
    aggregate: vi.fn() as MockFn<() => Promise<unknown>>,
    groupBy: vi.fn() as MockFn<() => Promise<unknown[]>>,
    deleteMany: vi.fn() as MockFn<() => Promise<{ count: number }>>,
    updateMany: vi.fn() as MockFn<() => Promise<{ count: number }>>,
    createMany: vi.fn() as MockFn<() => Promise<{ count: number }>>,
  }
}

// Type for a mocked Prisma model
export type MockPrismaModel<T = unknown> = ReturnType<typeof createMockPrismaModel<T>>

// Create the full mock prisma client
export function createMockPrismaClient() {
  return {
    user: createMockPrismaModel(),
    organization: createMockPrismaModel(),
    organizationMember: createMockPrismaModel(),
    subscription: createMockPrismaModel(),
    plan: createMockPrismaModel(),
    apiKey: createMockPrismaModel(),
    project: createMockPrismaModel(),
    templateSale: createMockPrismaModel(),
    templateDownloadAudit: createMockPrismaModel(),
    $transaction: vi.fn() as MockFn<() => Promise<unknown>>,
    $connect: vi.fn() as MockFn<() => Promise<void>>,
    $disconnect: vi.fn() as MockFn<() => Promise<void>>,
    $queryRaw: vi.fn() as MockFn<() => Promise<unknown>>,
    $executeRaw: vi.fn() as MockFn<() => Promise<number>>,
  }
}

// Type for the mocked Prisma client
export type MockPrismaClient = ReturnType<typeof createMockPrismaClient>

// Helper to get a typed mock model from the prisma import
export function getMockModel<T = unknown>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: any
): MockPrismaModel<T> {
  return model as MockPrismaModel<T>
}
