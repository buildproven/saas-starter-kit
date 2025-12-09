import { GET, POST } from './route'
import type { NextRequest } from 'next/server'

vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
  return {
    ...actual,
    NextResponse: {
      json: (data: unknown, init: { status?: number } = {}) => ({
        status: init.status ?? 200,
        headers: new Map<string, string>(),
        json: async () => data,
      }),
    },
  }
})

// Mock dependencies
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    organization: {
      findUnique: vi.fn(),
    },
  },
}))

import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'

const prismaMock = prisma as unknown as {
  apiKey: {
    findMany: vi.Mock
    count: vi.Mock
    create: vi.Mock
  }
  organization: {
    findUnique: vi.Mock
  }
}

const mockGetUser = getUser as vi.Mock

const createRequest = (url: string, body?: unknown): NextRequest => {
  return {
    url,
    json: async () => body || {},
  } as unknown as NextRequest
}

describe('/api/api-keys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const response = await GET(createRequest('http://localhost:3000/api/api-keys'))
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns API keys for authenticated user', async () => {
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.apiKey.findMany.mockResolvedValueOnce([
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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prismaMock.apiKey.findMany.mockResolvedValueOnce([])

      const response = await GET(
        createRequest('http://localhost:3000/api/api-keys?organizationId=org_1')
      )

      expect(response.status).toBe(200)
      expect(prismaMock.apiKey.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId: 'org_1',
          }),
        })
      )
    })

    it('returns 403 when user lacks access to organization', async () => {
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce(null)

      const response = await GET(
        createRequest('http://localhost:3000/api/api-keys?organizationId=org_99')
      )
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('marks expired API keys with status', async () => {
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      const pastDate = new Date('2020-01-01')
      prismaMock.apiKey.findMany.mockResolvedValueOnce([
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
      mockGetUser.mockResolvedValueOnce(null)

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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce(null)

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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prismaMock.apiKey.count.mockResolvedValueOnce(10) // At limit

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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prismaMock.apiKey.count.mockResolvedValueOnce(5) // Under limit

      prismaMock.apiKey.create.mockResolvedValueOnce({
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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prismaMock.apiKey.count.mockResolvedValueOnce(0)

      prismaMock.apiKey.create.mockResolvedValueOnce({
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
      mockGetUser.mockResolvedValueOnce({
        id: 'user_1',
        email: 'test@example.com',
        role: 'USER',
      })

      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: 'org_1',
        ownerId: 'user_1',
        members: [],
      })

      prismaMock.apiKey.count.mockResolvedValueOnce(0)

      const futureDate = new Date('2030-01-01')
      prismaMock.apiKey.create.mockResolvedValueOnce({
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
