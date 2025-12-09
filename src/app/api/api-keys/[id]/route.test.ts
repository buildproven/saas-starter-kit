/**
 * Tests for API Keys [id] API Routes
 */

vi.mock('next/server', () => {
  const actual = vi.importActual('next/server')
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

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    apiKey: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { GET, PUT, DELETE } from './route'

const mockGetUser = vi.mocked(getUser)
const mockPrismaApiKey = vi.mocked(prisma.apiKey, true)

describe('API Keys [id] API', () => {
  const mockUser = {
    id: 'user_123',
    email: 'test@example.com',
    name: 'Test User',
    image: null,
    role: 'USER' as const,
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
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue(mockUser)
  })

  const createRequest = (body?: object): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(body || {}),
    } as unknown as NextRequest
  }

  describe('GET /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 404 when API key has no organization', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce({
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
      mockPrismaApiKey.findUnique.mockResolvedValueOnce({
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
      mockPrismaApiKey.findUnique.mockResolvedValue(mockApiKey as never)

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
      mockPrismaApiKey.findUnique.mockResolvedValue(adminApiKey as never)

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
      mockPrismaApiKey.findUnique.mockResolvedValue(expiredApiKey as never)

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
      mockPrismaApiKey.findUnique.mockResolvedValue(noExpiryApiKey as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.apiKey.status).toBe('active')
    })
  })

  describe('PUT /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce({
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
      mockPrismaApiKey.findUnique.mockResolvedValue(expiredApiKey as never)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('expired')
    })

    it('updates API key name', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrismaApiKey.update.mockResolvedValue({
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
      mockPrismaApiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrismaApiKey.update.mockResolvedValue({
        ...mockApiKey,
        scopes: ['read', 'write'],
      } as never)

      const request = createRequest({ scopes: ['read', 'write'] })
      const response = await PUT(request, { params: { id: 'key_123' } })

      expect(response.status).toBe(200)
      expect(mockPrismaApiKey.update).toHaveBeenCalled()
    })

    it('returns 400 for invalid input', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValue(mockApiKey as never)

      const request = createRequest({ name: '' })
      const response = await PUT(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })
  })

  describe('DELETE /api/api-keys/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when API key not found', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('API key not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrismaApiKey.findUnique.mockResolvedValueOnce({
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
      mockPrismaApiKey.findUnique.mockResolvedValue(mockApiKey as never)
      mockPrismaApiKey.delete.mockResolvedValue(mockApiKey as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(data.message).toContain('revoked')
      expect(mockPrismaApiKey.delete).toHaveBeenCalledWith({
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
      mockPrismaApiKey.findUnique.mockResolvedValue(adminApiKey as never)
      mockPrismaApiKey.delete.mockResolvedValue(mockApiKey as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'key_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })
})
