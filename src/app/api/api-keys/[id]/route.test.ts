/**
 * Tests for API Keys [id] API Routes
 */

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
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

jest.mock('next-auth/next', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/auth', () => ({
  authOptions: {},
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { GET, PUT, DELETE } from './route'

const mockGetServerSession = getServerSession as jest.Mock
const mockPrisma = prisma as jest.Mocked<typeof prisma>

describe('API Keys [id] API', () => {
  const mockSession = {
    user: { id: 'user_123', email: 'test@example.com' },
  }

  const mockApiKey = {
    id: 'key_123',
    name: 'Test Key',
    keyHash: 'hash123',
    lastUsedAt: null,
    createdAt: new Date('2024-01-01'),
    expiresAt: new Date('2099-01-01'),
    organization: {
      id: 'org_123',
      name: 'Test Org',
      slug: 'test-org',
      ownerId: 'user_123',
      members: [{ role: 'OWNER' }],
    },
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  const createRequest = (body?: object): NextRequest => {
    return {
      json: jest.fn().mockResolvedValue(body || {}),
    } as unknown as NextRequest
  }

  describe('GET /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 404 when API key has no organization', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
        ...mockApiKey,
        organization: null,
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
        ...mockApiKey,
        organization: {
          ...mockApiKey.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns API key details for owner', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey).toBeDefined()
      expect(data.apiKey.id).toBe('key_123')
      expect(data.apiKey.name).toBe('Test Key')
      expect(data.apiKey.status).toBe('active')
      expect(data.apiKey.keyHash).toBeUndefined()
    })

    it('returns API key details for admin', async () => {
      const adminApiKey = {
        ...mockApiKey,
        organization: {
          ...mockApiKey.organization,
          ownerId: 'other_user',
          members: [{ role: 'ADMIN' }],
        },
      }
      mockPrisma.apiKey.findUnique.mockResolvedValue(adminApiKey as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey).toBeDefined()
    })

    it('returns expired status for expired key', async () => {
      const expiredApiKey = {
        ...mockApiKey,
        expiresAt: new Date('2020-01-01'),
      }
      mockPrisma.apiKey.findUnique.mockResolvedValue(expiredApiKey as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey.status).toBe('expired')
    })

    it('returns active status for key without expiration', async () => {
      const noExpiryApiKey = {
        ...mockApiKey,
        expiresAt: null,
      }
      mockPrisma.apiKey.findUnique.mockResolvedValue(noExpiryApiKey as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey.status).toBe('active')
    })
  })

  describe('PUT /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
        ...mockApiKey,
        organization: {
          ...mockApiKey.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      } as never)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns 409 when updating expired key', async () => {
      const expiredApiKey = {
        ...mockApiKey,
        expiresAt: new Date('2020-01-01'),
      }
      mockPrisma.apiKey.findUnique.mockResolvedValue(expiredApiKey as never)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('expired')
    })

    it('updates API key name', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrisma.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        name: 'Updated Key',
      } as never)

      const request = createRequest({ name: 'Updated Key' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey.name).toBe('Updated Key')
    })

    it('updates API key scopes', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrisma.apiKey.update.mockResolvedValue({
        ...mockApiKey,
        scopes: ['read', 'write'],
      } as never)

      const request = createRequest({ scopes: ['read', 'write'] })
      const response = await PUT(request, { params: { id: 'key_123' } })

      expect(response.status).toBe(200)
      expect(mockPrisma.apiKey.update).toHaveBeenCalled()
    })

    it('returns 400 for invalid input', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as never)

      const request = createRequest({ name: '' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })
  })

  describe('DELETE /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValueOnce({
        ...mockApiKey,
        organization: {
          ...mockApiKey.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      } as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('deletes API key for owner', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrisma.apiKey.delete.mockResolvedValue(mockApiKey as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('revoked')
      expect(mockPrisma.apiKey.delete).toHaveBeenCalledWith({
        where: { id: 'key_123' },
      })
    })

    it('deletes API key for admin', async () => {
      const adminApiKey = {
        ...mockApiKey,
        organization: {
          ...mockApiKey.organization,
          ownerId: 'other_user',
          members: [{ role: 'ADMIN' }],
        },
      }
      mockPrisma.apiKey.findUnique.mockResolvedValue(adminApiKey as never)
      mockPrisma.apiKey.delete.mockResolvedValue(mockApiKey as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })
})
