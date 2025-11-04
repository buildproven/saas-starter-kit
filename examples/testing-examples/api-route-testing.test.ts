/**
 * Example: API Route Testing Patterns
 *
 * This example shows comprehensive testing patterns for API routes
 * including authentication, authorization, validation, and error handling.
 *
 * Copy and adapt these patterns for testing your API endpoints.
 */

import { NextRequest } from 'next/server'
import { POST, GET } from '@/app/api/organizations/route'
import { createMockNextRequest, createMockUser, createMockOrganization } from '@/lib/test-utils'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'

// Mock external dependencies
jest.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    organizationMember: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
    },
    plan: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

jest.mock('@/lib/error-logging', () => ({
  logError: jest.fn(),
}))

const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe('/api/organizations', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('GET /api/organizations', () => {
    it('should return organizations for authenticated user', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123', role: 'USER' })
      const mockOrganizations = [
        createMockOrganization({ id: 'org_1', name: 'Acme Corp' }),
        createMockOrganization({ id: 'org_2', name: 'Tech Startup' }),
      ]

      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organizationMember.findMany.mockResolvedValue([
        {
          organizationId: 'org_1',
          role: 'OWNER',
          status: 'ACTIVE',
          organization: mockOrganizations[0],
        },
        {
          organizationId: 'org_2',
          role: 'MEMBER',
          status: 'ACTIVE',
          organization: mockOrganizations[1],
        },
      ] as any)

      const request = createMockNextRequest('GET', '/api/organizations')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.organizations).toHaveLength(2)
      expect(data.organizations[0].name).toBe('Acme Corp')
      expect(data.organizations[0].userRole).toBe('OWNER')
      expect(data.organizations[1].userRole).toBe('MEMBER')

      expect(mockPrisma.organizationMember.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user_123',
          status: 'ACTIVE',
        },
        include: {
          organization: {
            include: {
              subscription: { include: { plan: true } },
              _count: {
                select: {
                  members: { where: { status: 'ACTIVE' } },
                  projects: true,
                  apiKeys: true,
                },
              },
            },
          },
        },
      })
    })

    it('should return 401 for unauthenticated user', async () => {
      // Arrange
      mockGetServerSession.mockResolvedValue(null)
      const request = createMockNextRequest('GET', '/api/organizations')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(401)
      expect(mockPrisma.organizationMember.findMany).not.toHaveBeenCalled()
    })

    it('should return empty array when user has no organizations', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organizationMember.findMany.mockResolvedValue([])

      const request = createMockNextRequest('GET', '/api/organizations')

      // Act
      const response = await GET(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(200)
      expect(data.organizations).toHaveLength(0)
    })

    it('should handle database errors gracefully', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organizationMember.findMany.mockRejectedValue(new Error('Database connection failed'))

      const request = createMockNextRequest('GET', '/api/organizations')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(500)
    })
  })

  describe('POST /api/organizations', () => {
    it('should create organization for authenticated user', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123', role: 'USER' })
      const organizationData = {
        name: 'New Company',
        slug: 'new-company',
        description: 'A new organization',
      }
      const createdOrg = createMockOrganization({
        id: 'org_new',
        ...organizationData,
        ownerId: mockUser.id,
      })

      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organization.findUnique.mockResolvedValue(null) // Slug not taken
      mockPrisma.organization.create.mockResolvedValue({
        ...createdOrg,
        _count: { members: 1, projects: 0, apiKeys: 0 },
      } as any)

      const request = createMockNextRequest('POST', '/api/organizations', organizationData)

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(201)
      expect(data.organization.name).toBe('New Company')
      expect(data.organization.slug).toBe('new-company')
      expect(data.organization.ownerId).toBe(mockUser.id)

      expect(mockPrisma.organization.create).toHaveBeenCalledWith({
        data: {
          name: 'New Company',
          slug: 'new-company',
          description: 'A new organization',
          ownerId: mockUser.id,
          members: {
            create: {
              userId: mockUser.id,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          },
        },
        include: {
          _count: {
            select: {
              members: { where: { status: 'ACTIVE' } },
              projects: true,
              apiKeys: true,
            },
          },
        },
      })
    })

    it('should return 400 for invalid input', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      mockGetServerSession.mockResolvedValue({ user: mockUser })

      const invalidData = {
        name: '', // Empty name should fail validation
        slug: 'invalid-slug',
      }

      const request = createMockNextRequest('POST', '/api/organizations', invalidData)

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(400)
      expect(data.error).toBe('Invalid input')
      expect(data.details).toBeDefined()
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('should return 409 for duplicate slug', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      const organizationData = {
        name: 'Duplicate Company',
        slug: 'existing-slug',
        description: 'This slug already exists',
      }

      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organization.findUnique.mockResolvedValue(
        createMockOrganization({ slug: 'existing-slug' }) as any
      )

      const request = createMockNextRequest('POST', '/api/organizations', organizationData)

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(409)
      expect(data.error).toBe('Organization slug already exists')
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })

    it('should return 401 for unauthenticated user', async () => {
      // Arrange
      mockGetServerSession.mockResolvedValue(null)
      const request = createMockNextRequest('POST', '/api/organizations', {
        name: 'Test Org',
        slug: 'test-org',
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(401)
      expect(mockPrisma.organization.create).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      mockGetServerSession.mockResolvedValue({ user: mockUser })

      // Create request with malformed JSON
      const request = new NextRequest('http://localhost:3000/api/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ invalid json }',
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(400)
    })

    it('should handle database transaction failures', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      const organizationData = {
        name: 'Test Company',
        slug: 'test-company',
      }

      mockGetServerSession.mockResolvedValue({ user: mockUser })
      mockPrisma.organization.findUnique.mockResolvedValue(null)
      mockPrisma.organization.create.mockRejectedValue(new Error('Transaction failed'))

      const request = createMockNextRequest('POST', '/api/organizations', organizationData)

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(500)
    })
  })
})

// Integration test example
describe('Organizations API Integration', () => {
  it('should create organization and allow member access', async () => {
    // This would be an integration test that actually hits the database
    // Skip in unit tests, run in separate integration test suite

    if (process.env.NODE_ENV === 'test-integration') {
      // Setup test database
      // Create test user
      // Make actual API call
      // Verify database state
      // Cleanup
    }
  })
})

/**
 * Test utilities for API route testing
 */
export const apiTestUtils = {
  // Create authenticated request
  createAuthenticatedRequest: (method: string, url: string, body?: any, userId = 'test_user') => {
    const request = createMockNextRequest(method, url, body)
    mockGetServerSession.mockResolvedValue({
      user: createMockUser({ id: userId })
    })
    return request
  },

  // Create unauthenticated request
  createUnauthenticatedRequest: (method: string, url: string, body?: any) => {
    const request = createMockNextRequest(method, url, body)
    mockGetServerSession.mockResolvedValue(null)
    return request
  },

  // Assert error response
  assertErrorResponse: async (response: Response, expectedStatus: number, expectedError?: string) => {
    expect(response.status).toBe(expectedStatus)
    if (expectedError) {
      const data = await response.json()
      expect(data.error).toBe(expectedError)
    }
  },

  // Assert success response
  assertSuccessResponse: async (response: Response, expectedStatus = 200) => {
    expect(response.status).toBe(expectedStatus)
    const data = await response.json()
    expect(data.error).toBeUndefined()
    return data
  },

  // Mock database responses
  mockDatabaseResponses: (responses: Record<string, any>) => {
    Object.entries(responses).forEach(([method, returnValue]) => {
      const [model, operation] = method.split('.')
      if (mockPrisma[model as keyof typeof mockPrisma]) {
        ;(mockPrisma[model as keyof typeof mockPrisma] as any)[operation].mockResolvedValue(returnValue)
      }
    })
  },
}

/**
 * Example usage in other test files:
 *
 * import { apiTestUtils } from '@/examples/testing-examples/api-route-testing.test'
 *
 * describe('My API Route', () => {
 *   it('should work', async () => {
 *     const request = apiTestUtils.createAuthenticatedRequest('GET', '/api/my-route')
 *     apiTestUtils.mockDatabaseResponses({
 *       'organization.findMany': [mockOrg1, mockOrg2]
 *     })
 *
 *     const response = await GET(request)
 *     const data = await apiTestUtils.assertSuccessResponse(response)
 *
 *     expect(data.organizations).toHaveLength(2)
 *   })
 * })
 */