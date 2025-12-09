/**
 * Tests for Projects [id] API
 */

import { GET, PUT, DELETE } from './route'
import type { NextRequest } from 'next/server'

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
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import { getUser } from '@/lib/auth/get-user'
import { prisma } from '@/lib/prisma'

const mockGetUser = getUser as vi.Mock
const mockPrismaProjectFindUnique = prisma.project.findUnique as vi.Mock
const mockPrismaProjectUpdate = prisma.project.update as vi.Mock
const mockPrismaProjectDelete = prisma.project.delete as vi.Mock

describe('Projects [id] API', () => {
  const mockSession = { id: 'user_123', email: 'test@example.com' }

  const mockProject = {
    id: 'p1',
    name: 'Test Project',
    organizationId: 'org_123',
    status: 'ACTIVE',
    organization: {
      ownerId: 'user_123',
      members: [{ userId: 'user_123', role: 'OWNER', status: 'ACTIVE' }],
    },
  }

  const createRequest = (body: Record<string, unknown> = {}): NextRequest =>
    ({
      json: vi.fn().mockResolvedValue(body),
    }) as unknown as NextRequest

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue(mockSession)
  })

  describe('GET /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const response = await GET(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(null)

      const response = await GET(createRequest(), { params: { id: 'nonexistent' } })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Project not found')
    })

    it('returns 403 when user is not a member', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [],
        },
      })

      const response = await GET(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Forbidden')
    })

    it('returns project details for owner', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)

      const response = await GET(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.project).toBeDefined()
      expect(json.project.userRole).toBe('OWNER')
    })

    it('returns project details for member', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'MEMBER', status: 'ACTIVE' }],
        },
      })

      const response = await GET(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.project).toBeDefined()
    })

    it('returns 403 for viewer role (requires MEMBER)', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'VIEWER', status: 'ACTIVE' }],
        },
      })

      const response = await GET(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Forbidden')
    })
  })

  describe('PUT /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const response = await PUT(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(null)

      const response = await PUT(createRequest({ name: 'Updated' }), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Project not found')
    })

    it('returns 403 when user is viewer', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'VIEWER', status: 'ACTIVE' }],
        },
      })

      const response = await PUT(createRequest({ name: 'Updated' }), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Forbidden')
    })

    it('updates project for owner', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)
      mockPrismaProjectUpdate.mockResolvedValueOnce({
        ...mockProject,
        name: 'Updated Project',
      })

      const response = await PUT(createRequest({ name: 'Updated Project' }), {
        params: { id: 'p1' },
      })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.project.name).toBe('Updated Project')
    })

    it('updates project for member', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'MEMBER', status: 'ACTIVE' }],
        },
      })
      mockPrismaProjectUpdate.mockResolvedValueOnce({
        ...mockProject,
        description: 'Member updated',
      })

      const response = await PUT(createRequest({ description: 'Member updated' }), {
        params: { id: 'p1' },
      })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.project.description).toBe('Member updated')
    })

    it('updates project status', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)
      mockPrismaProjectUpdate.mockResolvedValueOnce({
        ...mockProject,
        status: 'ARCHIVED',
      })

      const response = await PUT(createRequest({ status: 'ARCHIVED' }), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.project.status).toBe('ARCHIVED')
    })

    it('returns 400 for invalid status', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)

      const response = await PUT(createRequest({ status: 'INVALID' }), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Invalid input')
    })

    it('returns 400 for name too long', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)

      const response = await PUT(createRequest({ name: 'a'.repeat(101) }), {
        params: { id: 'p1' },
      })
      const json = await response.json()

      expect(response.status).toBe(400)
      expect(json.error).toBe('Invalid input')
    })
  })

  describe('DELETE /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce(null)

      const response = await DELETE(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(401)
      expect(json.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(null)

      const response = await DELETE(createRequest(), { params: { id: 'nonexistent' } })
      const json = await response.json()

      expect(response.status).toBe(404)
      expect(json.error).toBe('Project not found')
    })

    it('returns 403 when user is member', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'MEMBER', status: 'ACTIVE' }],
        },
      })

      const response = await DELETE(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(403)
      expect(json.error).toBe('Forbidden')
    })

    it('deletes project for owner', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce(mockProject)
      mockPrismaProjectDelete.mockResolvedValueOnce(mockProject)

      const response = await DELETE(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
      expect(mockPrismaProjectDelete).toHaveBeenCalledWith({
        where: { id: 'p1' },
      })
    })

    it('deletes project for admin', async () => {
      mockPrismaProjectFindUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ownerId: 'other_user',
          members: [{ userId: 'user_123', role: 'ADMIN', status: 'ACTIVE' }],
        },
      })
      mockPrismaProjectDelete.mockResolvedValueOnce(mockProject)

      const response = await DELETE(createRequest(), { params: { id: 'p1' } })
      const json = await response.json()

      expect(response.status).toBe(200)
      expect(json.success).toBe(true)
    })
  })
})
