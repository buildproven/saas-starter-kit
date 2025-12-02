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
    expect(json).toEqual({ received: true, cached: true })
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

  it('handles subscription deleted event', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_to_cancel',
          cancel_at_period_end: false,
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.subscription.update.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(__prismaMock.subscription.update).toHaveBeenCalledWith({
      where: { subscriptionId: 'sub_to_cancel' },
      data: { status: 'CANCELED', cancelAtPeriodEnd: false },
    })
  })

  it('handles subscription deleted when update fails', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_deleted_notfound',
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_nonexistent',
          cancel_at_period_end: true,
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.subscription.update.mockRejectedValueOnce(new Error('Not found'))

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
  })

  it('handles invoice payment success', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_invoice_paid',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_123',
          subscription: 'sub_paid',
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __updateSubscriptionMock.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(__updateSubscriptionMock).toHaveBeenCalledWith('sub_paid', { status: 'ACTIVE' })
  })

  it('handles invoice payment success when subscription update fails', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_invoice_paid_err',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_err',
          subscription: 'sub_err',
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __updateSubscriptionMock.mockRejectedValueOnce(new Error('Update failed'))

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
  })

  it('handles invoice without subscription', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_invoice_nosub',
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          id: 'in_no_sub',
          subscription: null,
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
    expect(__updateSubscriptionMock).not.toHaveBeenCalled()
  })

  it('handles invoice payment failed when subscription update fails', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_invoice_failed_err',
      type: 'invoice.payment_failed',
      data: {
        object: {
          id: 'in_failed_err',
          subscription: 'sub_failed_err',
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __updateSubscriptionMock.mockRejectedValueOnce(new Error('Update failed'))

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
  })

  it('handles unhandled event type', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_unknown',
      type: 'charge.succeeded',
      data: { object: {} },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json).toEqual({ received: true })
  })

  it('looks up organization from customer when metadata is missing', async () => {
    const subscription = {
      id: 'sub_no_meta',
      status: 'active',
      items: { data: [{ price: { id: 'price_xyz' } }] },
      customer: 'cus_customer',
      current_period_start: 1710000000,
      current_period_end: 1710600000,
      cancel_at_period_end: false,
      metadata: {},
    }

    __constructEventMock.mockReturnValue({
      id: 'evt_no_meta',
      type: 'customer.subscription.created',
      data: { object: subscription },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
    __prismaMock.subscription.findUnique.mockResolvedValueOnce(null)
    __prismaMock.subscription.findFirst.mockResolvedValueOnce({ organizationId: 'org_from_customer' })
    __prismaMock.subscription.upsert.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))

    expect(response.status).toBe(200)
    expect(__prismaMock.subscription.findFirst).toHaveBeenCalledWith({
      where: { customerId: 'cus_customer' },
      select: { organizationId: true },
    })
  })

  it('skips upsert when organization cannot be resolved', async () => {
    // Reset all mocks to ensure clean state (clears implementations too)
    __prismaMock.subscription.findFirst.mockReset()
    __prismaMock.subscription.findUnique.mockReset()
    __prismaMock.subscription.upsert.mockReset()

    const subscription = {
      id: 'sub_no_org',
      status: 'active',
      items: { data: [{ price: { id: 'price_xyz' } }] },
      customer: 'cus_unknown',
      current_period_start: 1710000000,
      current_period_end: 1710600000,
      cancel_at_period_end: false,
      metadata: {},
    }

    __constructEventMock.mockReturnValue({
      id: 'evt_no_org',
      type: 'customer.subscription.created',
      data: { object: subscription },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
    __prismaMock.subscription.findUnique.mockResolvedValue(null)
    __prismaMock.subscription.findFirst.mockResolvedValue(null)

    const response = await POST(createRequest({}))

    expect(response.status).toBe(200)
    // When org cannot be resolved, upsert should not be called
    expect(__prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })

  it('handles subscription with string price', async () => {
    const subscription = {
      id: 'sub_str_price',
      status: 'trialing',
      items: { data: [{ price: 'price_string' }] },
      customer: { id: 'cus_obj' },
      current_period_start: 1710000000,
      current_period_end: 1710600000,
      cancel_at_period_end: true,
      metadata: { organizationId: 'org_str' },
    }

    __constructEventMock.mockReturnValue({
      id: 'evt_str_price',
      type: 'customer.subscription.updated',
      data: { object: subscription },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
    __prismaMock.subscription.upsert.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))

    expect(response.status).toBe(200)
    const upsertCall = __prismaMock.subscription.upsert.mock.calls[0][0]
    expect(upsertCall.create.priceId).toBe('price_string')
  })

  it('handles subscription without price', async () => {
    const subscription = {
      id: 'sub_no_price',
      status: 'active',
      items: { data: [] },
      customer: 'cus_no_price',
      current_period_start: 1710000000,
      current_period_end: 1710600000,
      cancel_at_period_end: false,
      metadata: { organizationId: 'org_no_price' },
    }

    __constructEventMock.mockReturnValue({
      id: 'evt_no_price',
      type: 'customer.subscription.created',
      data: { object: subscription },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})

    const response = await POST(createRequest({}))

    expect(response.status).toBe(200)
    expect(__prismaMock.subscription.upsert).not.toHaveBeenCalled()
  })

  it('maps various subscription statuses correctly', async () => {
    const testStatuses = [
      { input: 'incomplete', expected: 'INCOMPLETE' },
      { input: 'incomplete_expired', expected: 'INCOMPLETE_EXPIRED' },
      { input: 'trialing', expected: 'TRIALING' },
      { input: 'active', expected: 'ACTIVE' },
      { input: 'past_due', expected: 'PAST_DUE' },
      { input: 'canceled', expected: 'CANCELED' },
      { input: 'unpaid', expected: 'UNPAID' },
      { input: 'unknown', expected: 'INCOMPLETE' },
    ]

    for (const { input, expected } of testStatuses) {
      __prismaMock.subscription.upsert.mockClear()

      const subscription = {
        id: `sub_status_${input}`,
        status: input,
        items: { data: [{ price: { id: 'price_test' } }] },
        customer: 'cus_status',
        current_period_start: 1710000000,
        current_period_end: 1710600000,
        cancel_at_period_end: false,
        metadata: { organizationId: 'org_status' },
      }

      __constructEventMock.mockReturnValue({
        id: `evt_status_${input}`,
        type: 'customer.subscription.created',
        data: { object: subscription },
      })
      __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
      __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
      __prismaMock.subscription.upsert.mockResolvedValueOnce({})

      await POST(createRequest({}))

      const upsertCall = __prismaMock.subscription.upsert.mock.calls[0][0]
      expect(upsertCall.create.status).toBe(expected)
    }
  })

  it('returns 500 on processing error', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_error',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_error',
          status: 'active',
          items: { data: [{ price: { id: 'price_err' } }] },
          customer: 'cus_err',
          current_period_start: 1710000000,
          current_period_end: 1710600000,
          metadata: { organizationId: 'org_err' },
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockResolvedValueOnce({})
    __prismaMock.plan.findUnique.mockResolvedValueOnce({ id: 'plan_1' })
    __prismaMock.subscription.upsert.mockRejectedValueOnce(new Error('DB crashed'))

    const response = await POST(createRequest({}))
    const json = await response.json()

    expect(response.status).toBe(500)
    expect(json).toEqual({ error: 'Webhook processing failed' })
  })

  it('handles stripeWebhookEvent create throwing non-P2002 error', async () => {
    __constructEventMock.mockReturnValue({
      id: 'evt_throw',
      type: 'customer.subscription.created',
      data: {
        object: {
          id: 'sub_throw',
          status: 'active',
          items: { data: [{ price: { id: 'price_throw' } }] },
          customer: 'cus_throw',
          current_period_start: 1710000000,
          current_period_end: 1710600000,
          metadata: { organizationId: 'org_throw' },
        },
      },
    })
    __prismaMock.stripeWebhookEvent.create.mockRejectedValueOnce(new Error('Connection lost'))

    const response = await POST(createRequest({}))

    expect(response.status).toBe(500)
  })
})
import type { NextRequest } from 'next/server'
