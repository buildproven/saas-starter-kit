import { POST } from './route'

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: jest.fn((data, init = {}) => ({
        json: jest.fn().mockResolvedValue(data),
        status: init.status || 200,
        headers: new Map(),
      })),
    },
  }
})

jest.mock('@/lib/stripe', () => {
  const constructEvent = jest.fn()
  return {
    getStripeClient: () => ({
      webhooks: {
        constructEvent,
      },
    }),
    __constructEventMock: constructEvent,
  }
})

jest.mock('@/lib/prisma', () => {
  const prismaMock = {
    stripeWebhookEvent: {
      create: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  }
  return { prisma: prismaMock, __prismaMock: prismaMock }
})

jest.mock('@/lib/subscription', () => {
  const updateSubscription = jest.fn()
  return {
    SubscriptionService: {
      updateSubscription,
    },
    __updateSubscriptionMock: updateSubscription,
  }
})

const { __constructEventMock } = jest.requireMock('@/lib/stripe') as {
  __constructEventMock: jest.Mock
}
const { __prismaMock } = jest.requireMock('@/lib/prisma') as {
  __prismaMock: {
    stripeWebhookEvent: { create: jest.Mock }
    plan: { findUnique: jest.Mock }
    subscription: {
      findUnique: jest.Mock
      findFirst: jest.Mock
      upsert: jest.Mock
      update: jest.Mock
    }
  }
}
const { __updateSubscriptionMock } = jest.requireMock('@/lib/subscription') as {
  __updateSubscriptionMock: jest.Mock
}

describe('POST /api/webhooks/subscription', () => {
  beforeAll(() => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
  })

  beforeEach(() => {
    jest.clearAllMocks()
  })

  const createRequest = (payload: unknown, signature: string | null = 'sig_test'): NextRequest => {
    const body = JSON.stringify(payload)
    const headers = new Map<string, string>()
    if (signature) {
      headers.set('stripe-signature', signature)
    }
    return {
      text: jest.fn().mockResolvedValue(body),
      headers: {
        get: (key: string) => headers.get(key) ?? null,
      },
    } as unknown as NextRequest
  }

  it('processes subscription created event', async () => {
    const subscription = {
      id: 'sub_123',
      status: 'active',
      items: {
        data: [
          {
            price: { id: 'price_abc' },
          },
        ],
      },
      customer: 'cus_123',
      current_period_start: 1710000000,
      current_period_end: 1710600000,
      cancel_at_period_end: false,
      metadata: { organizationId: 'org_123' },
    }

    __constructEventMock.mockReturnValue({
      id: 'evt_1',
      type: 'customer.subscription.created',
      data: { object: subscription },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
    __prismaMock.subscription.findUnique.mockResolvedValueOnce(null)
    __prismaMock.subscription.findFirst.mockResolvedValueOnce(null)

    const response = await POST(createRequest({}))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toEqual({ received: true })
    expect(__prismaMock.subscription.upsert).toHaveBeenCalledTimes(1)
    const upsertArgs = __prismaMock.subscription.upsert.mock.calls[0][0]
    expect(upsertArgs.create.organizationId).toBe('org_123')
  })

  it('skips duplicate events gracefully', async () => {
    const duplicateError = { code: 'P2002' }

    __constructEventMock.mockReturnValue({
      id: 'evt_dup',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_dup',
          status: 'active',
          items: { data: [] },
          customer: 'cus_dup',
          current_period_start: 0,
          current_period_end: 0,
          cancel_at_period_end: false,
          metadata: {},
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockRejectedValueOnce(duplicateError)

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(__prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })

  it('returns 400 for invalid signature', async () => {
    __constructEventMock.mockImplementation(() => {
      throw new Error('Invalid')
    })

    const response = await POST(createRequest({}, 'sig_bad'))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Invalid signature' })
  })

  it('handles invoice payment failure by marking subscription past due', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_invoice',
      type: 'invoice.payment_failed',
      data: {
        object: {
          subscription: 'sub_999',
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(__updateSubscriptionMock).toHaveBeenCalledWith('sub_999', { status: 'PAST_DUE' })
  })

  it('returns 400 when signature header is missing', async () => {
    const response = await POST(createRequest({}, null))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'Missing Stripe signature or secret' })
  })
})
import type { NextRequest } from 'next/server'
