/**
 * Tests for Organizations [id] API Routes
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

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { prisma } from '@/lib/prisma'
import { GET, PUT, DELETE } from './route'

const mockGetServerSession = getServerSession as vi.Mock
const mockPrisma = prisma as vi.Mocked<typeof prisma>

describe('Organizations [id] API', () => {
  const mockSession = {
    user: { id: 'user_123', email: 'test@example.com' },
  }

  const mockOrganization = {
    id: 'org_123',
    name: 'Test Org',
    slug: 'test-org',
    ownerId: 'user_123',
    members: [{ role: 'OWNER', status: 'ACTIVE' }],
    owner: { id: 'user_123', name: 'Test User', email: 'test@example.com', image: null },
    subscription: null,
    projects: [],
    apiKeys: [],
    _count: { members: 1, projects: 0, apiKeys: 0 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetServerSession.mockResolvedValue(mockSession)
  })

  const createRequest = (body?: object): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(body || {}),
    } as unknown as NextRequest
  }

  describe('GET /api/organizations/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Organization not found')
    })

    it('returns 403 when user is not a member', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'other_user',
        members: [],
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns organization details for owner', async () => {
      mockPrisma.organization.findUnique
        .mockResolvedValueOnce(mockOrganization as never)
        .mockResolvedValueOnce(mockOrganization as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization).toBeDefined()
      expect(data.organization.userRole).toBe('OWNER')
    })

    it('returns organization details for active member', async () => {
      mockPrisma.organization.findUnique
        .mockResolvedValueOnce({
          ...mockOrganization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER', status: 'ACTIVE' }],
        } as never)
        .mockResolvedValueOnce(mockOrganization as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization).toBeDefined()
    })

    it('returns 403 for inactive member', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        ...mockOrganization,
        ownerId: 'other_user',
        members: [{ role: 'MEMBER', status: 'PENDING' }],
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })
  })

  describe('PUT /api/organizations/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Organization not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org_123',
        ownerId: 'other_user',
        members: [{ role: 'MEMBER', status: 'ACTIVE' }],
      } as never)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('updates organization name for owner', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrganization as never)
      mockPrisma.organization.update.mockResolvedValueOnce({
        ...mockOrganization,
        name: 'Updated Org',
      } as never)

      const request = createRequest({ name: 'Updated Org' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe('Updated Org')
    })

    it('updates organization for admin', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        ...mockOrganization,
        ownerId: 'other_user',
        members: [{ role: 'ADMIN', status: 'ACTIVE' }],
      } as never)
      mockPrisma.organization.update.mockResolvedValueOnce({
        ...mockOrganization,
        name: 'Admin Updated',
      } as never)

      const request = createRequest({ name: 'Admin Updated' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.organization.name).toBe('Admin Updated')
    })

    it('returns 409 when slug already exists', async () => {
      mockPrisma.organization.findUnique
        .mockResolvedValueOnce(mockOrganization as never)
        .mockResolvedValueOnce({ id: 'other_org' } as never)

      const request = createRequest({ slug: 'existing-slug' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('slug already exists')
    })

    it('allows updating to same slug', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrganization as never)
      mockPrisma.organization.update.mockResolvedValueOnce(mockOrganization as never)

      const request = createRequest({ slug: 'test-org' })
      const response = await PUT(request, { params: { id: 'org_123' } })

      expect(response.status).toBe(200)
    })

    it('returns 400 for invalid input', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(mockOrganization as never)

      const request = createRequest({ slug: 'Invalid Slug!' })
      const response = await PUT(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })
  })

  describe('DELETE /api/organizations/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when organization not found', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Organization not found')
    })

    it('returns 403 when user is not owner', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        ...mockOrganization,
        ownerId: 'other_user',
        _count: { members: 1, projects: 0, apiKeys: 0 },
      } as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns 409 when organization has projects', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        ...mockOrganization,
        _count: { members: 1, projects: 2, apiKeys: 0 },
      } as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('existing projects')
    })

    it('deletes organization successfully', async () => {
      mockPrisma.organization.findUnique.mockResolvedValueOnce({
        ...mockOrganization,
        _count: { members: 1, projects: 0, apiKeys: 0 },
      } as never)
      mockPrisma.organization.delete.mockResolvedValueOnce(mockOrganization as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPrisma.organization.delete).toHaveBeenCalledWith({
        where: { id: 'org_123' },
      })
    })
  })
})
