import { fulfillTemplateSale } from './fulfillment'
import { sendTemplateDeliveryEmail } from '@/lib/email/template-delivery'
import { grantGitHubAccess } from '@/lib/github/access-management'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    templateSale: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    templateSaleCustomer: {
      upsert: vi.fn(),
    },
  },
}))

vi.mock('@/lib/email/template-delivery', () => ({
  sendTemplateDeliveryEmail: vi.fn(),
}))

vi.mock('@/lib/github/access-management', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/github/access-management')>()
  return {
    ...actual,
    grantGitHubAccess: vi.fn(),
  }
})

type PrismaMockShape = {
  $transaction: vi.Mock
  templateSale: {
    findUnique: vi.Mock
    update: vi.Mock
  }
  templateSaleCustomer: {
    upsert: vi.Mock
  }
}

import { prisma } from '@/lib/prisma'

// Type-safe mock accessors using vi.mocked()
const mockTemplateSale = vi.mocked(prisma.templateSale, true)
const mockTemplateSaleCustomer = vi.mocked(prisma.templateSaleCustomer, true)
const mockTransaction = vi.mocked(prisma.$transaction, true)
;(mockTransaction as unknown as { mockImplementation: (fn: unknown) => void }).mockImplementation(
  async (cb: (ctx: PrismaMockShape) => Promise<unknown> | unknown) =>
    cb({
      $transaction: mockTransaction as unknown as vi.Mock,
      templateSale: mockTemplateSale as unknown as PrismaMockShape['templateSale'],
      templateSaleCustomer:
        mockTemplateSaleCustomer as unknown as PrismaMockShape['templateSaleCustomer'],
    })
)

const sendEmailMock = vi.mocked(sendTemplateDeliveryEmail, true)
const grantGitHubAccessMock = vi.mocked(grantGitHubAccess, true)

const createSale = (overrides: Partial<TemplateSale> = {}): TemplateSale =>
  ({
    id: 'sale-id',
    sessionId: 'sess-id',
    email: 'buyer@example.com',
    package: 'pro',
    amount: 99900,
    status: 'COMPLETED',
    paymentIntentId: 'pi_123',
    companyName: null,
    useCase: null,
    githubUsername: null,
    completedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    customerDetails: null,
    ...overrides,
  }) as TemplateSale

const createCustomer = (overrides: Partial<TemplateSaleCustomer> = {}): TemplateSaleCustomer =>
  ({
    id: 'customer-id',
    saleId: 'sale-id',
    email: 'buyer@example.com',
    package: 'pro',
    licenseKey: 'LIC-123',
    downloadToken: 'token-123',
    githubTeamId: null,
    githubUsername: null,
    supportTier: 'priority_email',
    accessExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    ...overrides,
  }) as TemplateSaleCustomer

describe('fulfillTemplateSale', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fulfills a completed sale and returns summary', async () => {
    const sale = createSale({
      id: 'sale_1',
      sessionId: 'sess_1',
      companyName: 'Example Co',
      metadata: null,
    })
    mockTemplateSale.findUnique.mockResolvedValueOnce(sale)
    sendEmailMock.mockResolvedValueOnce({ success: true, messageId: 'msg_1' })
    grantGitHubAccessMock.mockResolvedValueOnce({ success: true, teamId: 'team-pro' })
    mockTemplateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_1' }))
    mockTemplateSaleCustomer.upsert.mockResolvedValueOnce(
      createCustomer({
        licenseKey: 'PRO-XXXX-YYYY-ZZZZ',
        downloadToken: 'token123',
        accessExpiresAt: new Date(),
      })
    )

    const result = await fulfillTemplateSale({
      sessionId: 'sess_1',
      customerEmail: 'buyer@example.com',
      package: 'pro',
      customerName: 'Buyer',
      companyName: 'Example Co',
      githubUsername: 'BuyerDev',
    })

    expect(mockTemplateSale.findUnique).toHaveBeenCalledWith({
      where: { sessionId: 'sess_1' },
    })
    expect(sendEmailMock).toHaveBeenCalled()
    expect(grantGitHubAccessMock).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      package: 'pro',
      saleId: 'sale_1',
      githubUsername: 'buyerdev',
    })
    expect(result.licenseKey).toBeTruthy()
    expect(result.downloadUrl).toContain('/template-download')
    expect(result.githubAccessGranted).toBe(true)

    const updateArgs = mockTemplateSale.update.mock.calls.at(-1)?.[0]
    expect(updateArgs?.data.githubUsername).toBe('buyerdev')
    expect((updateArgs?.data.metadata as Record<string, unknown> | undefined)?.githubUsername).toBe(
      'buyerdev'
    )

    const upsertArgs = mockTemplateSaleCustomer.upsert.mock.calls[0]?.[0]
    expect(upsertArgs?.update.githubUsername).toBe('buyerdev')
    expect(
      (upsertArgs?.update.metadata as Record<string, unknown> | undefined)?.githubUsername
    ).toBe('buyerdev')
    expect(upsertArgs?.create.githubUsername).toBe('buyerdev')
    expect(
      (upsertArgs?.create.metadata as Record<string, unknown> | undefined)?.githubUsername
    ).toBe('buyerdev')
  })

  it('throws if sale not found', async () => {
    mockTemplateSale.findUnique.mockResolvedValueOnce(null)

    await expect(
      fulfillTemplateSale({
        sessionId: 'missing',
        customerEmail: 'buyer@example.com',
        package: 'hobby',
      })
    ).rejects.toThrow('Sale record not found')
  })

  it('throws when sale already fulfilled', async () => {
    const sale = createSale({
      id: 'sale_1',
      sessionId: 'sess_1',
      metadata: { fulfilled: true },
    })
    mockTemplateSale.findUnique.mockResolvedValueOnce(sale)

    await expect(
      fulfillTemplateSale({
        sessionId: 'sess_1',
        customerEmail: 'buyer@example.com',
        package: 'hobby',
      })
    ).rejects.toThrow('Template already delivered')
  })

  it('uses stored GitHub username when none provided', async () => {
    const sale = createSale({
      id: 'sale_2',
      sessionId: 'sess_2',
      metadata: { githubUsername: 'StoredUser' },
      githubUsername: 'StoredUser',
    })
    mockTemplateSale.findUnique.mockResolvedValueOnce(sale)
    sendEmailMock.mockResolvedValueOnce({ success: true, messageId: 'msg_2' })
    grantGitHubAccessMock.mockResolvedValueOnce({ success: true, teamId: 'team' })
    mockTemplateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_2' }))
    mockTemplateSaleCustomer.upsert.mockResolvedValueOnce(
      createCustomer({
        licenseKey: 'PRO-XXXX-YYYY-ZZZZ',
        downloadToken: 'token123',
      })
    )

    await fulfillTemplateSale({
      sessionId: 'sess_2',
      customerEmail: 'buyer@example.com',
      package: 'pro',
    })

    expect(grantGitHubAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ githubUsername: 'storeduser' })
    )
    const updateArgs = mockTemplateSale.update.mock.calls.at(-1)?.[0]
    expect(updateArgs?.data.githubUsername).toBe('storeduser')
  })
})
import type { TemplateSale, TemplateSaleCustomer } from '@prisma/client'
