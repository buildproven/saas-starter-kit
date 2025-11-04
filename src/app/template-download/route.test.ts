import { GET } from './route'
import type { NextRequest } from 'next/server'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    templateSaleCustomer: {
      findUnique: jest.fn(),
    },
    templateDownloadAudit: {
      create: jest.fn(),
    },
  },
}))

jest.mock('@/lib/error-logging', () => ({
  logError: jest.fn(),
  ErrorType: { SYSTEM: 'SYSTEM' },
}))

jest.mock('@/lib/auth/api-protection', () => ({
  rateLimit: jest.fn(),
}))

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    templateSaleCustomer: { findUnique: jest.Mock }
    templateDownloadAudit: { create: jest.Mock }
  }
}

const { rateLimit } = jest.requireMock('@/lib/auth/api-protection') as {
  rateLimit: jest.Mock
}

const createRequest = (token: string, format: 'zip' | 'tar' = 'zip'): NextRequest => {
  const headers = new Headers()
  headers.set('x-forwarded-for', '203.0.113.1')
  headers.set('user-agent', 'JestTest/1.0')

  return {
    url: `https://example.com/template-download?token=${token}&format=${format}`,
    headers,
  } as unknown as NextRequest
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('/template-download rate limiting and audit', () => {
  it('returns 429 when rate limit exceeded', async () => {
    rateLimit.mockReturnValueOnce(false)

    const response = await GET(createRequest('token123'))
    const body = await response.json()

    expect(response.status).toBe(429)
    expect(body.error).toMatch(/Too many download attempts/)
    expect(prisma.templateSaleCustomer.findUnique).not.toHaveBeenCalled()
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'RATE_LIMIT', downloadToken: 'token123' }),
      })
    )
  })

  it('records invalid token attempts', async () => {
    rateLimit.mockReturnValueOnce(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValueOnce(null)

    const response = await GET(createRequest('invalid'))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body.error).toBe('Invalid download token')
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'INVALID_TOKEN', downloadToken: 'invalid' }),
      })
    )
  })

  it('allows valid download and audits success', async () => {
    rateLimit.mockReturnValueOnce(true)
    prisma.templateSaleCustomer.findUnique.mockResolvedValueOnce({
      id: 'cust_1',
      saleId: 'sale_1',
      package: 'pro',
      accessExpiresAt: null,
      sale: { id: 'sale_1', status: 'COMPLETED' },
    })

    const response = await GET(createRequest('valid'))

    expect(response.status).toBe(200)
    expect(prisma.templateDownloadAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'SUCCESS', downloadToken: 'valid' }),
      })
    )
  })
})
jest.mock('next/server', () => {
  class MockNextResponse {
    body: unknown
    status: number
    headers: Map<string, string>

    constructor(body?: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
      this.body = body
      this.status = init.status ?? 200
      this.headers = new Map(Object.entries(init.headers || {}))
    }

    async arrayBuffer() {
      if (this.body instanceof Uint8Array) {
        return this.body
      }
      return new Uint8Array()
    }
  }

  const json = jest.fn((data: unknown, init: { status?: number } = {}) => ({
    json: jest.fn().mockResolvedValue(data),
    status: init.status ?? 200,
    headers: new Map<string, string>(),
  }))

  return {
    NextResponse: Object.assign(MockNextResponse, { json }),
  }
})
