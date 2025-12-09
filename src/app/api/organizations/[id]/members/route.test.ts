/**
 * Tests for Organization Members API Routes
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
    organization: {
      findUnique: vi.fn(),
    },
    organizationMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}))

import { NextRequest } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'
import { GET, POST } from './route'

const mockGetUser = getUser as vi.Mock
const mockOrganization = vi.mocked(prisma.organization, true)
const mockOrganizationMember = vi.mocked(prisma.organizationMember, true)
const mockUser = vi.mocked(prisma.user, true)

describe('Organization Members API', () => {
  const mockUserData = { id: 'user_123', email: 'test@example.com' }

  const mockOrganizationData = {
    id: 'org_123',
    name: 'Test Org',
    ownerId: 'user_123',
    createdAt: new Date(),
    members: [{ role: 'OWNER', status: 'ACTIVE' }],
  }

  const mockOwnerData = {
    id: 'user_123',
    name: 'Owner User',
    email: 'owner@example.com',
    image: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue(mockUserData)
  })

  const createRequest = (body?: object): NextRequest => {
    return {
      json: vi.fn().mockResolvedValue(body || {}),
    } as unknown as NextRequest
  }

  describe('GET /api/organizations/[id]/members', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when organization not found', async () => {
      mockOrganization.findUnique.mockResolvedValue(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Organization not found')
    })

    it('returns 403 when user is not a member', async () => {
      mockOrganization.findUnique.mockResolvedValue({
        ...mockOrganizationData,
        ownerId: 'other_user',
        members: [],
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns members list for owner', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockOrganizationMember.findMany.mockResolvedValue([
        { id: 'member_1', role: 'MEMBER', status: 'ACTIVE', user: { id: 'user_456' } },
      ] as never)
      mockUser.findUnique.mockResolvedValue(mockOwnerData as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.members).toBeDefined()
      expect(data.members[0].role).toBe('OWNER')
      expect(data.total).toBe(2)
    })

    it('returns members for regular member', async () => {
      mockOrganization.findUnique.mockResolvedValue({
        ...mockOrganizationData,
        ownerId: 'other_user',
        members: [{ role: 'MEMBER', status: 'ACTIVE' }],
      } as never)
      mockOrganizationMember.findMany.mockResolvedValue([] as never)
      mockUser.findUnique.mockResolvedValue(mockOwnerData as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.members).toBeDefined()
    })
  })

  describe('POST /api/organizations/[id]/members', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const request = createRequest({ email: 'new@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when organization not found', async () => {
      mockOrganization.findUnique.mockResolvedValue(null)

      const request = createRequest({ email: 'new@example.com' })
      const response = await POST(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Organization not found')
    })

    it('returns 403 when user is not admin', async () => {
      mockOrganization.findUnique.mockResolvedValue({
        ...mockOrganizationData,
        ownerId: 'other_user',
        members: [{ role: 'MEMBER', status: 'ACTIVE' }],
      } as never)

      const request = createRequest({ email: 'new@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns 404 when invitee user does not exist', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue(null)

      const request = createRequest({ email: 'nonexistent@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toContain('does not exist')
    })

    it('returns 409 when inviting the owner', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue({
        id: 'user_123',
        email: 'owner@example.com',
      } as never)

      const request = createRequest({ email: 'owner@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('already the owner')
    })

    it('returns 409 when user is already a member', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue({
        id: 'user_456',
        email: 'member@example.com',
      } as never)
      mockOrganizationMember.findUnique.mockResolvedValue({ id: 'existing_member' } as never)

      const request = createRequest({ email: 'member@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('already a member')
    })

    it('returns 409 when member limit reached', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue({
        id: 'user_456',
        email: 'new@example.com',
      } as never)
      mockOrganizationMember.findUnique.mockResolvedValue(null)
      mockOrganizationMember.count.mockResolvedValue(10)

      const request = createRequest({ email: 'new@example.com' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(409)
      expect(data.error).toContain('limit reached')
    })

    it('creates member successfully', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue({
        id: 'user_456',
        email: 'new@example.com',
      } as never)
      mockOrganizationMember.findUnique.mockResolvedValue(null)
      mockOrganizationMember.count.mockResolvedValue(5)
      mockOrganizationMember.create.mockResolvedValue({
        id: 'member_new',
        userId: 'user_456',
        organizationId: 'org_123',
        role: 'MEMBER',
        status: 'PENDING',
        user: { id: 'user_456', email: 'new@example.com' },
      } as never)

      const request = createRequest({ email: 'new@example.com', role: 'MEMBER' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.member).toBeDefined()
      expect(data.message).toContain('Invitation sent')
    })

    it('creates admin member', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)
      mockUser.findUnique.mockResolvedValue({
        id: 'user_456',
        email: 'admin@example.com',
      } as never)
      mockOrganizationMember.findUnique.mockResolvedValue(null)
      mockOrganizationMember.count.mockResolvedValue(3)
      mockOrganizationMember.create.mockResolvedValue({
        id: 'member_admin',
        role: 'ADMIN',
        status: 'PENDING',
        user: { id: 'user_456' },
      } as never)

      const request = createRequest({ email: 'admin@example.com', role: 'ADMIN' })
      const response = await POST(request, { params: { id: 'org_123' } })

      expect(response.status).toBe(201)
      expect(mockOrganizationMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'ADMIN' }),
        })
      )
    })

    it('returns 400 for invalid email', async () => {
      mockOrganization.findUnique.mockResolvedValue(mockOrganizationData as never)

      const request = createRequest({ email: 'invalid-email' })
      const response = await POST(request, { params: { id: 'org_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })
  })
})
