/**
 * Tests for Health Check API
 */

import { GET } from './route'

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (data: unknown, init?: { status?: number }) => ({
        json: async () => data,
        status: init?.status ?? 200,
      }),
    },
  }
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn(),
  },
}))

import { prisma } from '@/lib/prisma'

const mockQueryRaw = prisma.$queryRaw as jest.Mock

describe('GET /api/health', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns healthy status when database is connected', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.status).toBe('healthy')
    expect(json.database.status).toBe('connected')
    expect(json.timestamp).toBeDefined()
    expect(json.uptime).toBeDefined()
  })

  it('returns unhealthy status when database fails', async () => {
    mockQueryRaw.mockRejectedValueOnce(new Error('Connection refused'))

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json.status).toBe('unhealthy')
    expect(json.database.status).toBe('disconnected')
    expect(json.database.error).toBe('Connection refused')
  })

  it('returns degraded status when health check is skipped', async () => {
    process.env.SKIP_DB_HEALTHCHECK = 'true'

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.status).toBe('degraded')
    expect(json.database.status).toBe('skipped')
    expect(json.database.error).toContain('SKIP_DB_HEALTHCHECK')
  })

  it('includes environment information', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }])
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_APP_VERSION = '1.0.0'

    const response = await GET()
    const json = await response.json()

    expect(json.environment).toBe('production')
    expect(json.version).toBe('1.0.0')
  })

  it('includes response time', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ '?column?': 1 }])

    const response = await GET()
    const json = await response.json()

    expect(typeof json.database.responseTime).toBe('number')
    expect(json.database.responseTime).toBeGreaterThanOrEqual(0)
  })

  it('handles unknown database errors', async () => {
    mockQueryRaw.mockRejectedValueOnce('Unknown error')

    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json.database.error).toBe('Unknown error')
  })
})
