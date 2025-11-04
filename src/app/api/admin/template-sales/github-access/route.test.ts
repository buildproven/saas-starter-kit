import { postGithubOverrideHandler } from './route'
import { grantGitHubAccess } from '@/lib/github/access-management'
import type { AuthenticatedUser } from '@/lib/auth/api-protection'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    templateSale: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    templateSaleCustomer: {
      update: jest.fn(),
    },
  },
}))

jest.mock('@/lib/github/access-management', () => {
  const actual = jest.requireActual('@/lib/github/access-management')
  return {
    ...actual,
    grantGitHubAccess: jest.fn(),
  }
})

jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, init = {}) => ({
      json: jest.fn().mockResolvedValue(data),
      status: init.status || 200,
      headers: new Map(),
    })),
  },
}))

type PrismaMockShape = {
  templateSale: {
    findUnique: jest.Mock
    findFirst: jest.Mock
    update: jest.Mock
  }
  templateSaleCustomer: {
    update: jest.Mock
  }
}

const { prisma: prismaMock } = jest.requireMock('@/lib/prisma') as { prisma: PrismaMockShape }
const grantGitHubAccessMock = grantGitHubAccess as jest.MockedFunction<typeof grantGitHubAccess>

const mockRequest = (body: unknown): NextRequest =>
  ({
    json: jest.fn().mockResolvedValue(body),
  }) as unknown as NextRequest

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
    downloadToken: 'token',
    githubTeamId: null,
    githubUsername: null,
    supportTier: 'priority_email',
    accessExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
    ...overrides,
  }) as TemplateSaleCustomer

const authUser: AuthenticatedUser = {
  id: 'admin1',
  email: 'admin@example.com',
  role: 'SUPER_ADMIN',
  name: 'Admin',
}

const authContext = {
  user: authUser,
}

describe('POST /api/admin/template-sales/github-access', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('updates username and retries invitation', async () => {
    const sale: TemplateSale & { customer: TemplateSaleCustomer | null } = {
      ...createSale({ id: 'sale_1', metadata: {} }),
      customer: createCustomer({ saleId: 'sale_1', metadata: {} }),
    }

    prismaMock.templateSale.findUnique.mockResolvedValueOnce(sale)
    prismaMock.templateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_1' }))
    prismaMock.templateSaleCustomer.update.mockResolvedValueOnce(
      createCustomer({ saleId: 'sale_1' })
    )
    grantGitHubAccessMock.mockResolvedValueOnce({ success: true, teamId: 'team' })

    const request = mockRequest({
      saleId: 'sale_1',
      githubUsername: 'New-User',
    })

    const response = await postGithubOverrideHandler(request, authContext)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(prismaMock.templateSale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sale_1' },
        data: expect.objectContaining({ githubUsername: 'new-user' }),
      })
    )
    expect(prismaMock.templateSaleCustomer.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { saleId: 'sale_1' },
        data: expect.objectContaining({ githubUsername: 'new-user' }),
      })
    )
    expect(grantGitHubAccessMock).toHaveBeenCalledWith(
      expect.objectContaining({ githubUsername: 'new-user' })
    )
    expect(result.githubUsername).toBe('new-user')
    expect(result.invitation.success).toBe(true)
  })

  it('returns 404 when sale missing', async () => {
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(null)
    prismaMock.templateSale.findFirst.mockResolvedValueOnce(null)

    const request = mockRequest({
      saleId: 'missing',
      githubUsername: 'valid-user',
    })

    const response = await postGithubOverrideHandler(request, authContext)
    const result = await response.json()

    expect(response.status).toBe(404)
    expect(result.error).toBe('Template sale not found')
  })

  it('updates username without retry when disabled', async () => {
    const sale: TemplateSale & { customer: TemplateSaleCustomer | null } = {
      ...createSale({ id: 'sale_2', metadata: {} }),
      customer: null,
    }
    prismaMock.templateSale.findUnique.mockResolvedValueOnce(sale)
    prismaMock.templateSale.update.mockResolvedValueOnce(createSale({ id: 'sale_2' }))

    const request = mockRequest({
      saleId: 'sale_2',
      githubUsername: 'another-user',
      retry: false,
    })

    const response = await postGithubOverrideHandler(request, authContext)
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(grantGitHubAccessMock).not.toHaveBeenCalled()
    expect(result.retried).toBe(false)
  })
})
import type { NextRequest } from 'next/server'
import type { TemplateSale, TemplateSaleCustomer } from '@prisma/client'
jest.mock('@/lib/auth/api-protection', () => ({
  withSuperAdminAuth: (handler: unknown) => handler,
}))
