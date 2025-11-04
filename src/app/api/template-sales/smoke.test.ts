import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'

// Mock NextResponse to work within Jest environment
jest.mock('next/server', () => {
  class MockNextResponse {
    body: unknown
    status: number
    headers: Map<string, string>

    constructor(
      body?: unknown,
      init: { status?: number; headers?: Record<string, string | number> } = {}
    ) {
      this.body = body
      this.status = init.status ?? 200
      this.headers = new Map(
        Object.entries(init.headers || {}).map(([key, value]) => [key, String(value)])
      )
    }

    async json() {
      return this.body
    }

    async arrayBuffer() {
      if (this.body instanceof Uint8Array) {
        return this.body
      }
      if (typeof this.body === 'string') {
        return new TextEncoder().encode(this.body)
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

type TemplateSaleRecord = {
  id: string
  sessionId: string
  email: string
  package: 'basic' | 'pro' | 'enterprise'
  amount: number
  status: 'PENDING' | 'COMPLETED'
  paymentIntentId?: string | null
  companyName?: string | null
  useCase?: string | null
  githubUsername?: string | null
  metadata?: Record<string, unknown> | null
  customerDetails?: Record<string, unknown> | null
  completedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

type TemplateSaleCustomerRecord = {
  id: string
  saleId: string
  email: string
  package: string
  licenseKey: string
  downloadToken: string
  githubTeamId?: string | null
  githubUsername?: string | null
  supportTier: string
  accessExpiresAt: Date | null
  metadata?: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

const saleStoreBySession = new Map<string, TemplateSaleRecord>()
const saleStoreById = new Map<string, TemplateSaleRecord>()
const customerStore = new Map<string, TemplateSaleCustomerRecord>()
const downloadAudits: Array<Record<string, unknown>> = []

jest.mock('@/lib/prisma', () => {
  return {
    prisma: {
      templateSale: {
        create: jest.fn(async ({ data }: { data: Partial<TemplateSaleRecord> }) => {
          const record: TemplateSaleRecord = {
            id: randomUUID(),
            sessionId: data.sessionId!,
            email: data.email!,
            package: data.package as TemplateSaleRecord['package'],
            amount: data.amount ?? 0,
            status: (data.status as TemplateSaleRecord['status']) ?? 'PENDING',
            paymentIntentId: data.paymentIntentId ?? null,
            companyName: data.companyName ?? null,
            useCase: data.useCase ?? null,
            githubUsername: (data.githubUsername as string | undefined) ?? null,
            metadata: (data.metadata as Record<string, unknown>) ?? null,
            customerDetails: (data.customerDetails as Record<string, unknown>) ?? null,
            completedAt: data.completedAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          saleStoreBySession.set(record.sessionId, record)
          saleStoreById.set(record.id, record)
          return clone(record)
        }),
        findUnique: jest.fn(async ({ where }: { where: { sessionId?: string; id?: string } }) => {
          const record = where.sessionId
            ? saleStoreBySession.get(where.sessionId)
            : where.id
              ? saleStoreById.get(where.id)
              : undefined
          return record ? clone(record) : null
        }),
        update: jest.fn(
          async ({
            where,
            data,
          }: {
            where: { sessionId?: string; id?: string }
            data: Partial<TemplateSaleRecord>
          }) => {
            const existing = where.sessionId
              ? saleStoreBySession.get(where.sessionId)
              : where.id
                ? saleStoreById.get(where.id)
                : undefined
            if (!existing) throw new Error('Sale not found for update')
            const updated: TemplateSaleRecord = {
              ...existing,
              ...data,
              githubUsername:
                data.githubUsername !== undefined
                  ? (data.githubUsername as string | null)
                  : existing.githubUsername,
              metadata:
                data.metadata !== undefined
                  ? (data.metadata as Record<string, unknown> | null)
                  : existing.metadata,
              customerDetails:
                data.customerDetails !== undefined
                  ? (data.customerDetails as Record<string, unknown> | null)
                  : existing.customerDetails,
              status: (data.status as TemplateSaleRecord['status']) ?? existing.status,
              paymentIntentId: data.paymentIntentId ?? existing.paymentIntentId,
              completedAt: data.completedAt ?? existing.completedAt ?? null,
              updatedAt: new Date(),
            }
            saleStoreBySession.set(updated.sessionId, updated)
            saleStoreById.set(updated.id, updated)
            return clone(updated)
          }
        ),
      },
      templateSaleCustomer: {
        upsert: jest.fn(
          async ({
            where,
            update,
            create,
          }: {
            where: { saleId: string }
            update: Partial<TemplateSaleCustomerRecord>
            create: Partial<TemplateSaleCustomerRecord>
          }) => {
            const existing = customerStore.get(where.saleId)
            if (existing) {
              const updated: TemplateSaleCustomerRecord = {
                ...existing,
                ...update,
                githubTeamId: update.githubTeamId ?? existing.githubTeamId ?? null,
                githubUsername:
                  update.githubUsername !== undefined
                    ? (update.githubUsername as string | null)
                    : (existing.githubUsername ?? null),
                accessExpiresAt: update.accessExpiresAt ?? existing.accessExpiresAt ?? null,
                metadata:
                  update.metadata !== undefined
                    ? (update.metadata as Record<string, unknown> | null)
                    : (existing.metadata ?? null),
                updatedAt: new Date(),
              }
              customerStore.set(where.saleId, updated)
              return clone(updated)
            }

            const newRecord: TemplateSaleCustomerRecord = {
              id: randomUUID(),
              saleId: where.saleId,
              email: create.email!,
              package: create.package ?? 'basic',
              licenseKey: create.licenseKey ?? 'LIC-UNKNOWN',
              downloadToken: create.downloadToken ?? 'token-unknown',
              githubTeamId: create.githubTeamId ?? null,
              githubUsername: (create.githubUsername as string | undefined) ?? null,
              supportTier: create.supportTier ?? 'email',
              accessExpiresAt: create.accessExpiresAt ?? null,
              metadata: (create.metadata as Record<string, unknown>) ?? null,
              createdAt: new Date(),
              updatedAt: new Date(),
            }
            customerStore.set(where.saleId, newRecord)
            return clone(newRecord)
          }
        ),
        findUnique: jest.fn(async ({ where }: { where: { downloadToken?: string } }) => {
          if (where.downloadToken) {
            const customer = [...customerStore.values()].find(
              (c) => c.downloadToken === where.downloadToken
            )
            if (!customer) return null
            const sale = saleStoreById.get(customer.saleId)
            return sale
              ? clone({
                  ...customer,
                  sale: { id: sale.id, status: sale.status },
                })
              : clone(customer)
          }
          return null
        }),
      },
      templateDownloadAudit: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          downloadAudits.push(data)
          return clone(data)
        }),
      },
    },
  }
})

type CheckoutSessionParams = {
  customer_email: string
  metadata: Record<string, unknown>
  line_items?: Array<{ price: string; quantity?: number }>
}

const stripeSessions = new Map<
  string,
  {
    params: CheckoutSessionParams
    session: { id: string; url: string }
  }
>()

let checkoutPost: typeof import('@/app/api/template-sales/checkout/route').POST
let checkoutVerify: typeof import('@/app/api/template-sales/checkout/route').GET
let downloadGet: typeof import('@/app/template-download/route').GET

const clone = <T>(value: T): T => {
  const structured = (globalThis as { structuredClone?: typeof structuredClone }).structuredClone
  return structured ? structured(value) : JSON.parse(JSON.stringify(value))
}

jest.mock('@/lib/stripe', () => {
  let counter = 0
  return {
    getStripeClient: () => ({
      checkout: {
        sessions: {
          create: jest.fn(async (params: Record<string, unknown>) => {
            counter += 1
            const id = `cs_test_${counter}`
            const session = {
              id,
              url: `https://checkout.stripe.com/pay/${id}`,
            }
            stripeSessions.set(id, {
              params: params as CheckoutSessionParams,
              session,
            })
            return session
          }),
          retrieve: jest.fn(async (sessionId: string) => {
            const stored = stripeSessions.get(sessionId)
            if (!stored) {
              throw new Error(`Session ${sessionId} not found`)
            }

            const lineItems = stored.params.line_items ?? []
            const firstPrice = lineItems[0]?.price ?? 'price_unknown'

            return {
              id: sessionId,
              payment_status: 'paid',
              customer_details: {
                email: stored.params.customer_email,
                name: 'Buyer Example',
                address: null,
                phone: null,
              },
              metadata: stored.params.metadata,
              payment_intent: 'pi_test_123',
              invoice: null,
              line_items: {
                data: [
                  {
                    price: { id: firstPrice },
                  },
                ],
              },
            }
          }),
        },
      },
    }),
  }
})

jest.mock('@/lib/email/template-delivery', () => ({
  sendTemplateDeliveryEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'msg_123' }),
}))

jest.mock('@/lib/github/access-management', () => {
  const actual = jest.requireActual('@/lib/github/access-management')
  return {
    ...actual,
    grantGitHubAccess: jest.fn().mockResolvedValue({ success: true, teamId: 'team-pro' }),
  }
})

jest.mock('@/lib/auth/api-protection', () => ({
  rateLimit: jest.fn(() => true),
}))

const loggedErrors: Error[] = []

jest.mock('@/lib/error-logging', () => ({
  logError: jest.fn((error: Error) => {
    loggedErrors.push(error)
  }),
  ErrorType: { SYSTEM: 'SYSTEM', PAYMENT: 'PAYMENT' },
}))

describe('Template sales smoke test', () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_TEMPLATE_BASIC_PRICE_ID = 'price_basic'
    process.env.STRIPE_TEMPLATE_PRO_PRICE_ID = 'price_pro'
    process.env.STRIPE_TEMPLATE_ENTERPRISE_PRICE_ID = 'price_enterprise'
    ;({ POST: checkoutPost, GET: checkoutVerify } = await import(
      '@/app/api/template-sales/checkout/route'
    ))
    ;({ GET: downloadGet } = await import('@/app/template-download/route'))
  })

  beforeEach(() => {
    saleStoreBySession.clear()
    saleStoreById.clear()
    customerStore.clear()
    downloadAudits.length = 0
    stripeSessions.clear()
    jest.clearAllMocks()
    loggedErrors.length = 0
  })

  const createCheckoutRequest = (payload: Record<string, unknown>): NextRequest => {
    const body = JSON.stringify(payload)
    return {
      json: jest.fn().mockResolvedValue(JSON.parse(body)),
    } as unknown as NextRequest
  }

  const createVerifyRequest = (sessionId: string): NextRequest => {
    const url = `https://example.com/api/template-sales/checkout?session_id=${sessionId}`
    return {
      url,
    } as unknown as NextRequest
  }

  const createDownloadRequest = (token: string): NextRequest => {
    const headers = new Headers()
    headers.set('x-forwarded-for', '198.51.100.5')
    headers.set('user-agent', 'JestClient/1.0')
    return {
      url: `https://example.com/template-download?token=${token}&format=zip`,
      headers,
    } as unknown as NextRequest
  }

  it('processes checkout, fulfillment, and download successfully', async () => {
    const checkoutResponse = await checkoutPost(
      createCheckoutRequest({
        package: 'pro',
        email: 'buyer@example.com',
        companyName: 'Example Co',
        useCase: 'Internal tools',
        githubUsername: 'BuyerDev',
      })
    )
    const checkoutBody = await checkoutResponse.json()

    if (checkoutResponse.status !== 200) {
      throw new Error(
        `Checkout failed (${checkoutResponse.status}): ${JSON.stringify(checkoutBody)}`
      )
    }

    expect(checkoutResponse.status).toBe(200)
    expect(checkoutBody.sessionId).toMatch(/^cs_test_/)
    expect(saleStoreBySession.size).toBe(1)
    const storedSale = [...saleStoreBySession.values()][0]
    if (!storedSale) {
      throw new Error('Expected sale to be stored after checkout')
    }
    expect(storedSale.status).toBe('PENDING')
    expect(storedSale.githubUsername?.toLowerCase()).toBe('buyerdev')

    const verifyResponse = await checkoutVerify(createVerifyRequest(checkoutBody.sessionId))
    const verifyJson = await verifyResponse.json()

    expect(verifyResponse.status).toBe(200)
    expect(verifyJson.sale.status).toBe('COMPLETED')
    expect(verifyJson.fulfillment.githubUsername).toBe('buyerdev')
    expect(verifyJson.fulfillment.githubAccessGranted).toBe(true)
    expect(verifyJson.fulfillment.downloadToken).toBeTruthy()

    const downloadResponse = await downloadGet(
      createDownloadRequest(verifyJson.fulfillment.downloadToken)
    )

    expect(downloadResponse.status).toBe(200)
    expect(downloadAudits.some((record) => record.status === 'SUCCESS')).toBe(true)
  })
})
