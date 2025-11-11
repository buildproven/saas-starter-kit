import { GET, POST } from './route'
import type { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import type { Session } from 'next-auth'

// Mock dependencies
jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
  },
}))

const { prisma } = jest.requireMock('@/lib/prisma') as {
  prisma: {
    apiKey: {
      findMany: jest.Mock
      count: jest.Mock
      create: jest.Mock
    }
    organization: {
      findUnique: jest.Mock
    }
  }
}

const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const createRequest = (url: string, body?: unknown): NextRequest => {
  return {
    url,
    json: async () => body || {},
  } as unknown as NextRequest
}

describe('/api/api-keys', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const response = await GET(createRequest('http://localhost:3000/api/api-keys'))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns API keys for authenticated user', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.apiKey.findMany.mockResolvedValueOnce([
        {
          id: 'key_1',
          name: 'Test Key',
          scopes: ['read'],
          lastUsedAt: null,
          createdAt: new Date(),
          expiresAt: null,
          organization: {
            id: 'org_1',
            name: 'Test Org',
            slug: 'test-org',
          },
        },
      ])

      const response = await GET(createRequest('http://localhost:3000/api/api-keys'))
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKeys).toHaveLength(1)
      expect(data.apiKeys[0].name).toBe('Test Key')
      expect(data.apiKeys[0].scopes).toEqual(['read'])
      expect(data.total).toBe(1)
    })

    it('filters API keys by organization when organizationId provided', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prisma.apiKey.findMany.mockResolvedValueOnce([])

      const response = await GET(
        createRequest('http://localhost:3000/api/api-keys?organizationId=org_1')
      )

      expect(response.status).toBe(200)
      expect(prisma.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org_1',
          }),
        })
      )
    })

    it('returns 403 when user lacks access to organization', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce(null)

      const response = await GET(
        createRequest('http://localhost:3000/api/api-keys?organizationId=org_99')
      )
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('marks expired API keys with status', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      const pastDate = new Date('2020-01-01')
      prisma.apiKey.findMany.mockResolvedValueOnce([
        {
          id: 'key_expired',
          name: 'Expired Key',
          scopes: ['read'],
          lastUsedAt: null,
          createdAt: new Date(),
          expiresAt: pastDate,
          organization: {
            id: 'org_1',
            name: 'Test Org',
            slug: 'test-org',
          },
        },
      ])

      const response = await GET(createRequest('http://localhost:3000/api/api-keys'))
      const data = await response.json()

      expect(data.apiKeys[0].status).toBe('expired')
    })
  })

  describe('POST', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 400 for invalid input', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: '', // Invalid: empty name
          organizationId: 'org_1',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })

    it('returns 403 when user lacks access to organization', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce(null)

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_99',
          scopes: ['read', 'write'],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns 403 when user is not ADMIN or higher', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'other_user',
        members: [{ role: 'MEMBER' }],
      })

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
          scopes: ['read'],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Insufficient permissions')
    })

    it('returns 409 when API key limit reached', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prisma.apiKey.count.mockResolvedValueOnce(10) // At limit

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
          scopes: ['read'],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toBe('API key limit reached for current plan')
    })

    it('creates API key successfully with scopes', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prisma.apiKey.count.mockResolvedValueOnce(5) // Under limit

      prisma.apiKey.create.mockResolvedValueOnce({
        id: 'key_new',
        name: 'Test Key',
        scopes: ['read', 'write'],
        createdAt: new Date(),
        expiresAt: null,
        organization: {
          id: 'org_1',
          name: 'Test Org',
          slug: 'test-org',
        },
      })

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
          scopes: ['read', 'write'],
        })
      )
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.apiKey.name).toBe('Test Key')
      expect(data.apiKey.scopes).toEqual(['read', 'write'])
      expect(data.apiKey.key).toBeTruthy() // Raw key returned once
      expect(data.apiKey.key.startsWith('sk_')).toBe(true)
      expect(data.message).toContain('not be shown again')
    })

    it('creates API key with default scopes when not provided', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prisma.apiKey.count.mockResolvedValueOnce(0)

      prisma.apiKey.create.mockResolvedValueOnce({
        id: 'key_new',
        name: 'Test Key',
        scopes: ['read'], // Default scope
        createdAt: new Date(),
        expiresAt: null,
        organization: {
          id: 'org_1',
          name: 'Test Org',
          slug: 'test-org',
        },
      })

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
          // No scopes provided
        })
      )
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.apiKey.scopes).toEqual(['read'])
    })

    it('creates API key with expiration date', async () => {
      mockGetServerSession.mockResolvedValueOnce({
        user: { id: 'user_1', email: 'test@example.com' },
      } as Session)

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prisma.apiKey.count.mockResolvedValueOnce(0)

      const futureDate = new Date('2030-01-01')
      prisma.apiKey.create.mockResolvedValueOnce({
        id: 'key_new',
        name: 'Test Key',
        scopes: ['read'],
        createdAt: new Date(),
        expiresAt: futureDate,
        organization: {
          id: 'org_1',
          name: 'Test Org',
          slug: 'test-org',
        },
      })

      const response = await POST(
        createRequest('http://localhost:3000/api/api-keys', {
          name: 'Test Key',
          organizationId: 'org_1',
          scopes: ['read'],
          expiresAt: '2030-01-01T00:00:00.000Z',
        })
      )
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.apiKey.expiresAt).toBeTruthy()
    })
  })
})
