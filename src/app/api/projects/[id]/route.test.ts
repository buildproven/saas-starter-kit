/**
 * Tests for Projects [id] API Routes
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
    project: {
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

describe('Projects [id] API', () => {
  const mockSession = {
    user: { id: 'user_123', email: 'test@example.com' },
  }

  const mockProject = {
    id: 'proj_123',
    name: 'Test Project',
    description: 'Test description',
    status: 'ACTIVE',
    organization: {
      id: 'org_123',
      name: 'Test Org',
      slug: 'test-org',
      ownerId: 'user_123',
      members: [{ role: 'OWNER' }],
      owner: { id: 'user_123', name: 'Test User', email: 'test@example.com' },
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

  describe('GET /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Project not found')
    })

    it('returns 403 when user is not a member', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [],
        },
      } as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('returns project details for owner', async () => {
      // Mock is called twice: once in checkProjectPermission, once for detailed info
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project).toBeDefined()
      expect(data.project.userRole).toBe('OWNER')
    })

    it('returns project details for member', async () => {
      const memberProject = {
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      }
      mockPrisma.project.findUnique.mockResolvedValue(memberProject as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project).toBeDefined()
    })

    it('returns 403 for viewer role (requires MEMBER)', async () => {
      const viewerProject = {
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'VIEWER' }],
        },
      }
      mockPrisma.project.findUnique.mockResolvedValue(viewerProject as never)

      const request = createRequest()
      const response = await GET(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })
  })

  describe('PUT /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Project not found')
    })

    it('returns 403 when user is viewer', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'VIEWER' }],
        },
      } as never)

      const request = createRequest({ name: 'New Name' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('updates project for owner', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        name: 'Updated Project',
      } as never)

      const request = createRequest({ name: 'Updated Project' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.name).toBe('Updated Project')
    })

    it('updates project for member', async () => {
      const memberProject = {
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      }
      mockPrisma.project.findUnique.mockResolvedValue(memberProject as never)
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        description: 'Member updated',
      } as never)

      const request = createRequest({ description: 'Member updated' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.description).toBe('Member updated')
    })

    it('updates project status', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)
      mockPrisma.project.update.mockResolvedValue({
        ...mockProject,
        status: 'ARCHIVED',
      } as never)

      const request = createRequest({ status: 'ARCHIVED' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.project.status).toBe('ARCHIVED')
    })

    it('returns 400 for invalid status', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)

      const request = createRequest({ status: 'INVALID' })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })

    it('returns 400 for name too long', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)

      const request = createRequest({ name: 'a'.repeat(101) })
      const response = await PUT(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
    })
  })

  describe('DELETE /api/projects/[id]', () => {
    it('returns 401 when not authenticated', async () => {
      mockGetServerSession.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(401)
      expect(data.error).toBe('Unauthorized')
    })

    it('returns 404 when project not found', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce(null)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'nonexistent' } })
      const data = await response.json()

      expect(response.status).toBe(404)
      expect(data.error).toBe('Project not found')
    })

    it('returns 403 when user is member', async () => {
      mockPrisma.project.findUnique.mockResolvedValueOnce({
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'MEMBER' }],
        },
      } as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(403)
      expect(data.error).toBe('Forbidden')
    })

    it('deletes project for owner', async () => {
      mockPrisma.project.findUnique.mockResolvedValue(mockProject as never)
      mockPrisma.project.delete.mockResolvedValue(mockProject as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
      expect(mockPrisma.project.delete).toHaveBeenCalledWith({
        where: { id: 'proj_123' },
      })
    })

    it('deletes project for admin', async () => {
      const adminProject = {
        ...mockProject,
        organization: {
          ...mockProject.organization,
          ownerId: 'other_user',
          members: [{ role: 'ADMIN' }],
        },
      }
      mockPrisma.project.findUnique.mockResolvedValue(adminProject as never)
      mockPrisma.project.delete.mockResolvedValue(mockProject as never)

      const request = createRequest()
      const response = await DELETE(request, { params: { id: 'proj_123' } })
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.success).toBe(true)
    })
  })
})
