import { randomUUID } from 'node:crypto'
import type { NextRequest } from 'next/server'

// Mock NextResponse to work within Jest environment
vi.mock('next/server', () => {
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

  const json = vi.fn((data: unknown, init: { status?: number } = {}) => ({
    json: vi.fn().mockResolvedValue(data),
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

type PrismaMock = {
  templateSale: typeof import('@/lib/prisma').prisma.templateSale
  templateSaleCustomer: typeof import('@/lib/prisma').prisma.templateSaleCustomer
  templateDownloadAudit: typeof import('@/lib/prisma').prisma.templateDownloadAudit
  $transaction: vi.Mock
}

interface PrismaCreateInput {
  data: {
    sessionId?: string
    email?: string
    package: string
    amount?: number
    status?: string
    paymentIntentId?: string
    companyName?: string
    useCase?: string
    githubUsername?: string | null
    metadata?: Record<string, unknown> | null
    customerDetails?: Record<string, unknown> | null
    completedAt?: Date | null
  }
}

interface PrismaWhereInput {
  where: {
    sessionId?: string
    id?: string
    saleId?: string
    downloadToken?: string
  }
}

interface PrismaUpdateInput extends PrismaWhereInput {
  data: Partial<PrismaCreateInput['data']>
}

interface PrismaUpsertInput extends PrismaWhereInput {
  update: Partial<PrismaCreateInput['data']>
  create: PrismaCreateInput['data']
}

vi.mock('@/lib/prisma', () => {
  const prisma = {
    templateSale: {} as PrismaMock['templateSale'],
    templateSaleCustomer: {} as PrismaMock['templateSaleCustomer'],
    templateDownloadAudit: {} as PrismaMock['templateDownloadAudit'],
    $transaction: vi.fn(),
  }

  ;(prisma as Record<string, unknown>).templateSale = {
    create: vi.fn(async ({ data }: PrismaCreateInput) => {
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
    findUnique: vi.fn(async ({ where }: PrismaWhereInput) => {
      const record = where.sessionId
        ? saleStoreBySession.get(where.sessionId)
        : where.id
          ? saleStoreById.get(where.id)
          : undefined
      return record ? clone(record) : null
    }),
    update: vi.fn(async ({ where, data }: PrismaUpdateInput) => {
      const existing = where.sessionId
        ? saleStoreBySession.get(where.sessionId)
        : where.id
          ? saleStoreById.get(where.id)
          : undefined
      if (!existing) throw new Error('Sale not found for update')
      const updated: TemplateSaleRecord = {
        ...existing,
        ...(data as Partial<TemplateSaleRecord>),
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
    }),
  }
  ;(prisma as Record<string, unknown>).templateSaleCustomer = {
    upsert: vi.fn(async ({ where, update, create }: PrismaUpsertInput) => {
      const saleId = where.saleId!
      const existing = customerStore.get(saleId)
      if (existing) {
        const updateData = update as Partial<TemplateSaleCustomerRecord>
        const updated: TemplateSaleCustomerRecord = {
          ...existing,
          ...updateData,
          githubTeamId: (updateData.githubTeamId ?? existing.githubTeamId ?? null) as string | null,
          githubUsername:
            updateData.githubUsername !== undefined
              ? (updateData.githubUsername as string | null)
              : (existing.githubUsername ?? null),
          accessExpiresAt: (updateData.accessExpiresAt ??
            existing.accessExpiresAt ??
            null) as Date | null,
          metadata:
            updateData.metadata !== undefined
              ? (updateData.metadata as Record<string, unknown> | null)
              : (existing.metadata ?? null),
          updatedAt: new Date(),
        }
        customerStore.set(saleId, updated)
        return clone(updated)
      }

      const createData = create as Partial<TemplateSaleCustomerRecord> & {
        email: string
        package: string
      }
      const newRecord: TemplateSaleCustomerRecord = {
        id: randomUUID(),
        saleId: saleId,
        email: createData.email!,
        package: createData.package ?? 'basic',
        licenseKey: (createData.licenseKey ?? 'LIC-UNKNOWN') as string,
        downloadToken: (createData.downloadToken ?? 'token-unknown') as string,
        githubTeamId: (createData.githubTeamId ?? null) as string | null,
        githubUsername: (createData.githubUsername as string | undefined) ?? null,
        supportTier: (createData.supportTier ?? 'email') as string,
        accessExpiresAt: (createData.accessExpiresAt ?? null) as Date | null,
        metadata: (createData.metadata as Record<string, unknown>) ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      customerStore.set(saleId, newRecord)
      return clone(newRecord)
    }),
    findUnique: vi.fn(async ({ where }: PrismaWhereInput) => {
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
  }
  ;(prisma as Record<string, unknown>).templateDownloadAudit = {
    create: vi.fn(async ({ data }: PrismaCreateInput) => {
      downloadAudits.push(data as Record<string, unknown>)
      return clone(data)
    }),
  }

  prisma.$transaction = vi.fn(
    async (
      cb: (ctx: {
        templateSale: PrismaMock['templateSale']
        templateSaleCustomer: PrismaMock['templateSaleCustomer']
      }) => unknown
    ) =>
      cb({
        templateSale: prisma.templateSale,
        templateSaleCustomer: prisma.templateSaleCustomer,
      })
  )

  return { prisma }
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

interface StripeSessionRetrieveResult {
  id: string
  payment_status: string
  customer_details: {
    email: string
    name: string
    address: null
    phone: null
  }
  metadata: Record<string, unknown>
  payment_intent: string
  invoice: null
  line_items: {
    data: Array<{
      price: { id: string }
    }>
  }
}

vi.mock('@/lib/stripe', () => {
  let counter = 0
  return {
    getStripeClient: () => ({
      checkout: {
        sessions: {
          create: vi.fn(async (params: CheckoutSessionParams) => {
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
          retrieve: vi.fn(async (sessionId: string): Promise<StripeSessionRetrieveResult> => {
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

vi.mock('@/lib/email/template-delivery', () => ({
  sendTemplateDeliveryEmail: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_123' }),
}))

vi.mock('@/lib/github/access-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github/access-management')>()
  return {
    ...actual,
    grantGitHubAccess: vi.fn().mockResolvedValue({ success: true, teamId: 'team-pro' }),
  }
})

vi.mock('@/lib/auth/api-protection', () => ({
  rateLimit: vi.fn(() => true),
}))

const loggedErrors: Error[] = []

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn((error: Error) => {
    loggedErrors.push(error)
  }),
  ErrorType: { SYSTEM: 'SYSTEM', PAYMENT: 'PAYMENT' },
}))

describe('Template sales smoke test', () => {
  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
    process.env.STRIPE_SECRET_KEY = 'sk_test'
    process.env.STRIPE_TEMPLATE_HOBBY_PRICE_ID = 'price_hobby'
    process.env.STRIPE_TEMPLATE_PRO_PRICE_ID = 'price_pro'
    process.env.STRIPE_TEMPLATE_DIRECTOR_PRICE_ID = 'price_director'
    ;({ POST: checkoutPost, GET: checkoutVerify } =
      await import('@/app/api/template-sales/checkout/route'))
    ;({ GET: downloadGet } = await import('@/app/template-download/route'))
  })

  beforeEach(() => {
    saleStoreBySession.clear()
    saleStoreById.clear()
    customerStore.clear()
    downloadAudits.length = 0
    stripeSessions.clear()
    vi.clearAllMocks()
    loggedErrors.length = 0
  })

  const createCheckoutRequest = (payload: Record<string, unknown>): NextRequest => {
    const body = JSON.stringify(payload)
    return {
      json: vi.fn().mockResolvedValue(JSON.parse(body)),
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
