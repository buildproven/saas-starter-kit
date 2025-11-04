import { fulfillTemplateSale } from './fulfillment'
import { sendTemplateDeliveryEmail } from '@/lib/email/template-delivery'
import { grantGitHubAccess } from '@/lib/github/access-management'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    templateSale: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    templateSaleCustomer: {
      upsert: jest.fn(),
    },
  },
}))

jest.mock('@/lib/email/template-delivery', () => ({
  sendTemplateDeliveryEmail: jest.fn(),
}))

jest.mock('@/lib/github/access-management', () => {
  const actual = jest.requireActual('@/lib/github/access-management')
  return {
    ...actual,
    grantGitHubAccess: jest.fn(),
  }
})

type PrismaMockShape = {
  templateSale: {
    findUnique: jest.Mock
    update: jest.Mock
  }
  templateSaleCustomer: {
    upsert: jest.Mock
  }
}

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as { prisma: PrismaMockShape }
const sendEmailMock = sendTemplateDeliveryEmail as jest.MockedFunction<
  typeof sendTemplateDeliveryEmail
>
const grantGitHubAccessMock = grantGitHubAccess as jest.MockedFunction<typeof grantGitHubAccess>

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
    jest.clearAllMocks()
  })

  it('fulfills a completed sale and returns summary', async () => {
    const sale = createSale({
      id: 'sale_1',
      sessionId: 'sess_1',
      companyName: 'Example Co',
      metadata: null,
    })
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(sale)
    sendEmailMock.mockResolvedValueOnce({ success: true, messageId: 'msg_1' })
    grantGitHubAccessMock.mockResolvedValueOnce({ success: true, teamId: 'team-pro' })
    prismaMock.templateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_1' }))
    prismaMock.templateSaleCustomer.upsert.mockResolvedValueOnce(
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

    expect(prismaMock.templateSale.findUnique).toHaveBeenCalledWith({
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

    const updateArgs = prismaMock.templateSale.update.mock.calls[0][0]
    expect(updateArgs.data.githubUsername).toBe('buyerdev')
    expect(updateArgs.data.metadata.githubUsername).toBe('buyerdev')

    const upsertArgs = prismaMock.templateSaleCustomer.upsert.mock.calls[0][0]
    expect(upsertArgs.update.githubUsername).toBe('buyerdev')
    expect(upsertArgs.update.metadata.githubUsername).toBe('buyerdev')
    expect(upsertArgs.create.githubUsername).toBe('buyerdev')
    expect(upsertArgs.create.metadata.githubUsername).toBe('buyerdev')
  })

  it('throws if sale not found', async () => {
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(null)

    await expect(
      fulfillTemplateSale({
        sessionId: 'missing',
        customerEmail: 'buyer@example.com',
        package: 'basic',
      })
    ).rejects.toThrow('Sale record not found')
  })

  it('throws when sale already fulfilled', async () => {
    const sale = createSale({
      id: 'sale_1',
      sessionId: 'sess_1',
      metadata: { fulfilled: true },
    })
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(sale)

    await expect(
      fulfillTemplateSale({
        sessionId: 'sess_1',
        customerEmail: 'buyer@example.com',
        package: 'basic',
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
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(sale)
    sendEmailMock.mockResolvedValueOnce({ success: true, messageId: 'msg_2' })
    grantGitHubAccessMock.mockResolvedValueOnce({ success: true, teamId: 'team' })
    prismaMock.templateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_2' }))
    prismaMock.templateSaleCustomer.upsert.mockResolvedValueOnce(
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
    const updateArgs = prismaMock.templateSale.update.mock.calls[0][0]
    expect(updateArgs.data.githubUsername).toBe('storeduser')
  })
})
import type { TemplateSale, TemplateSaleCustomer } from '@prisma/client'
