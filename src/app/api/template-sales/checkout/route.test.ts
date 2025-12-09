/**
 * Tests for Template Sales Checkout API Routes
 */

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

vi.mock('@/lib/stripe', () => ({
  getStripeClient: vi.fn(() => ({
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  })),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    templateSale: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
  ErrorType: {
    PAYMENT: 'payment',
    SYSTEM: 'system',
  },
}))

vi.mock('@/lib/template-sales/fulfillment', () => ({
  fulfillTemplateSale: vi.fn(),
}))

import { NextRequest } from 'next/server'
import { getStripeClient } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { fulfillTemplateSale } from '@/lib/template-sales/fulfillment'
import { POST, GET } from './route'

const mockStripe = getStripeClient as vi.Mock
const mockTemplateSaleModel = vi.mocked(prisma.templateSale, true)
const mockFulfillTemplateSale = fulfillTemplateSale as vi.Mock

describe('Template Sales Checkout API', () => {
  const originalEnv = process.env

  const mockStripeClient = {
    checkout: {
      sessions: {
        create: vi.fn(),
        retrieve: vi.fn(),
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockStripe.mockReturnValue(mockStripeClient)
    process.env = {
      ...originalEnv,
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_TEMPLATE_HOBBY_PRICE_ID: 'price_hobby',
      STRIPE_TEMPLATE_PRO_PRICE_ID: 'price_pro',
      STRIPE_TEMPLATE_DIRECTOR_PRICE_ID: 'price_director',
      NEXT_PUBLIC_APP_URL: 'https://example.com',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  const createRequest = (body?: object, url?: string): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(body || {}),
      url: url || 'https://example.com/api/template-sales/checkout',
    } as unknown as NextRequest
  }

  describe('POST /api/template-sales/checkout', () => {
    it('returns 501 when template sales not configured', async () => {
      delete process.env.STRIPE_TEMPLATE_HOBBY_PRICE_ID

      const request = createRequest({ package: 'hobby', email: 'test@example.com' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(501)
      expect(data.error).toBe('Template sales not configured')
    })

    it('returns 400 for invalid package', async () => {
      const request = createRequest({ package: 'invalid', email: 'test@example.com' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('returns 400 for invalid email', async () => {
      const request = createRequest({ package: 'hobby', email: 'invalid-email' })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('returns 400 for invalid GitHub username', async () => {
      const request = createRequest({
        package: 'hobby',
        email: 'test@example.com',
        githubUsername: '--invalid--',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid request data')
    })

    it('creates checkout session for hobby package', async () => {
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'cs_test_123',
        url: 'https://checkout.stripe.com/test',
      })
      mockTemplateSaleModel.create.mockResolvedValue({
        id: 'sale_123',
        sessionId: 'cs_test_123',
      } as never)

      const request = createRequest({
        package: 'hobby',
        email: 'customer@example.com',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sessionId).toBe('cs_test_123')
      expect(data.url).toBe('https://checkout.stripe.com/test')
      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'payment',
          customer_email: 'customer@example.com',
        })
      )
    })

    it('creates checkout session for pro package with metadata', async () => {
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'cs_pro_123',
        url: 'https://checkout.stripe.com/pro',
      })
      mockTemplateSaleModel.create.mockResolvedValue({
        id: 'sale_pro',
        sessionId: 'cs_pro_123',
      } as never)

      const request = createRequest({
        package: 'pro',
        email: 'pro@example.com',
        companyName: 'Acme Corp',
        useCase: 'Building SaaS',
        githubUsername: 'acmedev',
      })
      const response = await POST(request)

      expect(response.status).toBe(200)
      expect(mockTemplateSaleModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'pro@example.com',
          package: 'pro',
          companyName: 'Acme Corp',
          useCase: 'Building SaaS',
          githubUsername: 'acmedev',
        }),
      })
    })

    it('creates checkout session for director package', async () => {
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'cs_director',
        url: 'https://checkout.stripe.com/director',
      })
      mockTemplateSaleModel.create.mockResolvedValue({
        id: 'sale_director',
        sessionId: 'cs_director',
      } as never)

      const request = createRequest({
        package: 'director',
        email: 'director@example.com',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.package.name).toContain('Director')
    })

    it('uses custom success/cancel URLs when provided', async () => {
      mockStripeClient.checkout.sessions.create.mockResolvedValue({
        id: 'cs_custom',
        url: 'https://checkout.stripe.com/custom',
      })
      mockTemplateSaleModel.create.mockResolvedValue({} as never)

      const request = createRequest({
        package: 'hobby',
        email: 'test@example.com',
        successUrl: 'https://mysite.com/success',
        cancelUrl: 'https://mysite.com/cancel',
      })
      await POST(request)

      expect(mockStripeClient.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url: 'https://mysite.com/success',
          cancel_url: 'https://mysite.com/cancel',
        })
      )
    })

    it('handles Stripe errors', async () => {
      const stripeError = new Error('Stripe failed')
      Object.assign(stripeError, { type: 'StripeError' })
      // Mock as Stripe error
      const StripeErrors = { StripeError: class extends Error {} }
      mockStripeClient.checkout.sessions.create.mockRejectedValue(
        Object.assign(new StripeErrors.StripeError('Card declined'), { type: 'StripeError' })
      )

      const request = createRequest({
        package: 'hobby',
        email: 'test@example.com',
      })
      const response = await POST(request)

      // Non-Stripe error falls through to 500
      expect(response.status).toBe(500)
    })

    it('returns 500 for unexpected errors', async () => {
      mockStripeClient.checkout.sessions.create.mockRejectedValue(new Error('Unexpected'))

      const request = createRequest({
        package: 'hobby',
        email: 'test@example.com',
      })
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to create checkout session')
    })
  })

  describe('GET /api/template-sales/checkout', () => {
    it('returns 501 when template sales not configured', async () => {
      delete process.env.STRIPE_TEMPLATE_HOBBY_PRICE_ID

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_123'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(501)
      expect(data.error).toBe('Template sales not configured')
    })

    it('returns 400 when session_id is missing', async () => {
      const request = createRequest(undefined, 'https://example.com/api/template-sales/checkout')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Session ID required')
    })

    it('returns 400 when payment not completed', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_unpaid',
        payment_status: 'unpaid',
      })

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_unpaid'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Payment not completed')
    })

    it('returns 404 when sale record not found', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_notfound',
        payment_status: 'paid',
      })
      mockTemplateSaleModel.findUnique.mockResolvedValue(null)

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_notfound'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Sale record not found')
    })

    it('verifies purchase and updates record', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_paid',
        payment_status: 'paid',
        payment_intent: 'pi_123',
        customer_details: {
          email: 'buyer@example.com',
          name: 'John Buyer',
          address: {
            line1: '123 Main St',
            line2: null,
            city: 'San Francisco',
            state: 'CA',
            postal_code: '94105',
            country: 'US',
          },
          phone: '+1234567890',
        },
      })
      mockTemplateSaleModel.findUnique.mockResolvedValue({
        id: 'sale_123',
        sessionId: 'cs_paid',
        email: 'buyer@example.com',
        package: 'pro',
        githubUsername: 'johndoe',
        metadata: {},
      } as never)
      mockTemplateSaleModel.update.mockResolvedValue({
        id: 'sale_123',
        sessionId: 'cs_paid',
        email: 'buyer@example.com',
        package: 'pro',
        status: 'COMPLETED',
        githubUsername: 'johndoe',
        metadata: {},
      } as never)
      mockFulfillTemplateSale.mockResolvedValue({
        emailSent: true,
        githubAccessGranted: true,
      })

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_paid'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sale.status).toBe('COMPLETED')
      expect(data.fulfillment).toBeDefined()
      expect(mockTemplateSaleModel.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            paymentIntentId: 'pi_123',
          }),
        })
      )
    })

    it('extracts github username from metadata when not in record', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_meta',
        payment_status: 'paid',
        customer_details: { email: 'meta@example.com' },
      })
      mockTemplateSaleModel.findUnique.mockResolvedValue({
        id: 'sale_meta',
        sessionId: 'cs_meta',
        email: 'meta@example.com',
        package: 'director',
        githubUsername: null,
        metadata: { githubUsername: 'metauser' },
      } as never)
      mockTemplateSaleModel.update.mockResolvedValue({
        id: 'sale_meta',
        package: 'director',
        status: 'COMPLETED',
        metadata: { githubUsername: 'metauser' },
      } as never)
      mockFulfillTemplateSale.mockResolvedValue({})

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_meta'
      )
      await GET(request)

      expect(mockFulfillTemplateSale).toHaveBeenCalledWith(
        expect.objectContaining({
          githubUsername: 'metauser',
        })
      )
    })

    it('handles fulfillment errors gracefully', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_fulfill_err',
        payment_status: 'paid',
        customer_details: { email: 'err@example.com' },
      })
      mockTemplateSaleModel.findUnique.mockResolvedValue({
        id: 'sale_err',
        sessionId: 'cs_fulfill_err',
        email: 'err@example.com',
        package: 'hobby',
        metadata: {},
      } as never)
      mockTemplateSaleModel.update.mockResolvedValue({
        id: 'sale_err',
        package: 'hobby',
        status: 'COMPLETED',
      } as never)
      mockFulfillTemplateSale.mockRejectedValue(new Error('Fulfillment failed'))

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_fulfill_err'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.sale).toBeDefined()
      expect(data.fulfillment).toBeNull()
    })

    it('returns 500 for unexpected errors', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockRejectedValue(new Error('DB error'))

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_err'
      )
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data.error).toBe('Failed to verify purchase')
    })

    it('handles sessions without customer address', async () => {
      mockStripeClient.checkout.sessions.retrieve.mockResolvedValue({
        id: 'cs_noaddr',
        payment_status: 'paid',
        payment_intent: 'pi_noaddr',
        customer_details: {
          email: 'noaddr@example.com',
          name: null,
          address: null,
          phone: null,
        },
      })
      mockTemplateSaleModel.findUnique.mockResolvedValue({
        id: 'sale_noaddr',
        sessionId: 'cs_noaddr',
        email: 'noaddr@example.com',
        package: 'hobby',
        companyName: 'Test Co',
        metadata: {},
      } as never)
      mockTemplateSaleModel.update.mockResolvedValue({
        id: 'sale_noaddr',
        package: 'hobby',
        status: 'COMPLETED',
      } as never)
      mockFulfillTemplateSale.mockResolvedValue({})

      const request = createRequest(
        undefined,
        'https://example.com/api/template-sales/checkout?session_id=cs_noaddr'
      )
      const response = await GET(request)

      expect(response.status).toBe(200)
    })
  })
})
