/**
 * Tests for Template Sales Fulfill API
 */

import { POST } from './route'
import type { NextRequest } from 'next/server'

vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
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

vi.mock('@/lib/template-sales/fulfillment', () => ({
  fulfillTemplateSale: vi.fn(),
}))

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
  ErrorType: {
    SYSTEM: 'system',
  },
}))

import { fulfillTemplateSale } from '@/lib/template-sales/fulfillment'

const mockFulfillTemplateSale = fulfillTemplateSale as vi.MockedFunction<
  typeof fulfillTemplateSale
>

describe('POST /api/template-sales/fulfill', () => {
  const createRequest = (
    body: Record<string, unknown>,
    headers: Record<string, string> = {}
  ): NextRequest => {
    const headerMap = new Map(Object.entries(headers))
    return {
      json: vi.fn().mockResolvedValue(body),
      headers: {
        get: (key: string) => headerMap.get(key) || null,
      },
    } as unknown as NextRequest
  }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TEMPLATE_FULFILLMENT_SECRET = 'test_secret'
  })

  afterEach(() => {
    delete process.env.TEMPLATE_FULFILLMENT_SECRET
  })

  it('returns 401 without authorization header', async () => {
    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 with wrong token', async () => {
    const response = await POST(createRequest({}, { 'x-template-fulfillment-token': 'wrong' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 401 when secret not configured', async () => {
    delete process.env.TEMPLATE_FULFILLMENT_SECRET

    const response = await POST(createRequest({}, { 'x-template-fulfillment-token': 'test_secret' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json.error).toBe('Unauthorized')
  })

  it('accepts Bearer token format', async () => {
    mockFulfillTemplateSale.mockResolvedValueOnce({
      success: true,
      licenseKey: 'LIC-123',
    } as Awaited<ReturnType<typeof fulfillTemplateSale>>)

    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_123',
          customerEmail: 'test@example.com',
          package: 'hobby',
        },
        { authorization: 'Bearer test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('returns 400 for invalid request data', async () => {
    const response = await POST(
      createRequest({ invalid: 'data' }, { 'x-template-fulfillment-token': 'test_secret' })
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
    expect(json.details).toBeDefined()
  })

  it('returns 400 for invalid email', async () => {
    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_123',
          customerEmail: 'invalid-email',
          package: 'hobby',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
  })

  it('returns 400 for invalid package', async () => {
    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_123',
          customerEmail: 'test@example.com',
          package: 'invalid_package',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Invalid request data')
  })

  it('fulfills hobby package successfully', async () => {
    mockFulfillTemplateSale.mockResolvedValueOnce({
      success: true,
      licenseKey: 'HOB-123',
      downloadUrl: 'https://example.com/download',
    } as Awaited<ReturnType<typeof fulfillTemplateSale>>)

    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_123',
          customerEmail: 'test@example.com',
          package: 'hobby',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
    expect(json.fulfillment).toBeDefined()
    expect(mockFulfillTemplateSale).toHaveBeenCalledWith({
      sessionId: 'sess_123',
      customerEmail: 'test@example.com',
      package: 'hobby',
      customerName: undefined,
      companyName: undefined,
    })
  })

  it('fulfills pro package with optional fields', async () => {
    mockFulfillTemplateSale.mockResolvedValueOnce({
      success: true,
      licenseKey: 'PRO-456',
    } as Awaited<ReturnType<typeof fulfillTemplateSale>>)

    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_456',
          customerEmail: 'pro@example.com',
          package: 'pro',
          customerName: 'John Doe',
          companyName: 'Acme Inc',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )

    expect(response.status).toBe(200)
    expect(mockFulfillTemplateSale).toHaveBeenCalledWith({
      sessionId: 'sess_456',
      customerEmail: 'pro@example.com',
      package: 'pro',
      customerName: 'John Doe',
      companyName: 'Acme Inc',
    })
  })

  it('fulfills director package', async () => {
    mockFulfillTemplateSale.mockResolvedValueOnce({
      success: true,
      licenseKey: 'DIR-789',
    } as Awaited<ReturnType<typeof fulfillTemplateSale>>)

    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_789',
          customerEmail: 'director@example.com',
          package: 'director',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.success).toBe(true)
  })

  it('handles fulfillment errors', async () => {
    mockFulfillTemplateSale.mockRejectedValueOnce(new Error('Fulfillment failed'))

    const response = await POST(
      createRequest(
        {
          sessionId: 'sess_error',
          customerEmail: 'error@example.com',
          package: 'hobby',
        },
        { 'x-template-fulfillment-token': 'test_secret' }
      )
    )
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json.error).toBe('Fulfillment failed')
  })
})
