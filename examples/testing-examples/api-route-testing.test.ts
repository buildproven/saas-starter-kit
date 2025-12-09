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
import { vi } from 'vitest'

// Declare variables to hold the mock functions for Prisma
let prismaOrgFindManyMock: ReturnType<typeof vi.fn>
let prismaOrgCreateMock: ReturnType<typeof vi.fn>
let prismaOrgFindUniqueMock: ReturnType<typeof vi.fn>
let prismaOrgMemberFindManyMock: ReturnType<typeof vi.fn>
let prismaOrgMemberFindFirstMock: ReturnType<typeof vi.fn>
let prismaOrgMemberCreateMock: ReturnType<typeof vi.fn>
let prismaSubscriptionFindUniqueMock: ReturnType<typeof vi.fn>
let prismaPlanFindUniqueMock: ReturnType<typeof vi.fn>

// Declare variable to hold the mock function for getUser
let mockGetUser: ReturnType<typeof vi.fn>

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    organization: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    organizationMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
    },
    plan: {
      findUnique: vi.fn(),
    },
  },
}))

vi.mock('@/lib/error-logging', () => ({
  logError: vi.fn(),
}))

describe('/api/organizations', () => {
  beforeEach(async () => {
    vi.clearAllMocks()

    // Dynamically import the mocked getUser to get a reference to the vi.fn() instance
    const { getUser: importedGetUser } = await import('@/lib/auth/get-user')
    mockGetUser = importedGetUser as ReturnType<typeof vi.fn>

    // Dynamically import the mocked prisma and assign its methods to our local mock variables
    const { prisma: importedPrisma } = await import('@/lib/prisma')
    prismaOrgFindManyMock = importedPrisma.organization.findMany as ReturnType<typeof vi.fn>
    prismaOrgCreateMock = importedPrisma.organization.create as ReturnType<typeof vi.fn>
    prismaOrgFindUniqueMock = importedPrisma.organization.findUnique as ReturnType<typeof vi.fn>
    prismaOrgMemberFindManyMock = importedPrisma.organizationMember.findMany as ReturnType<
      typeof vi.fn
    >
    prismaOrgMemberFindFirstMock = importedPrisma.organizationMember.findFirst as ReturnType<
      typeof vi.fn
    >
    prismaOrgMemberCreateMock = importedPrisma.organizationMember.create as ReturnType<typeof vi.fn>
    prismaSubscriptionFindUniqueMock = importedPrisma.subscription.findUnique as ReturnType<
      typeof vi.fn
    >
    prismaPlanFindUniqueMock = importedPrisma.plan.findUnique as ReturnType<typeof vi.fn>

    // Reset Prisma mocks for each test
    prismaOrgFindManyMock.mockReset()
    prismaOrgCreateMock.mockReset()
    prismaOrgFindUniqueMock.mockReset()
    prismaOrgMemberFindManyMock.mockReset()
    prismaOrgMemberFindFirstMock.mockReset()
    prismaOrgMemberCreateMock.mockReset()
    prismaSubscriptionFindUniqueMock.mockReset()
    prismaPlanFindUniqueMock.mockReset()

    // Default authenticated user session for mockGetUser
    mockGetUser.mockResolvedValue({
      id: 'user_123',
      role: 'USER',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
    })
  })

  describe('GET /api/organizations', () => {
    it('should return organizations for authenticated user', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123', role: 'USER' })
      const mockOrganizations = [
        createMockOrganization({ id: 'org_1', name: 'Acme Corp', ownerId: mockUser.id }),
        createMockOrganization({ id: 'org_2', name: 'Tech Startup' }),
      ]
      prismaOrgFindManyMock.mockResolvedValue([
        {
          ...mockOrganizations[0],
          owner: { id: mockUser.id, name: mockUser.name, email: mockUser.email },
          members: [
            {
              userId: mockUser.id,
              role: 'OWNER',
              status: 'ACTIVE',
            },
          ],
        },
        {
          ...mockOrganizations[1],
          owner: { id: 'other_owner', name: 'Other User', email: 'other@example.com' },
          members: [
            {
              userId: mockUser.id,
              role: 'MEMBER',
              status: 'ACTIVE',
            },
          ],
        },
      ] as any) // Cast to any to bypass type issues with the partial mock

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

      expect(prismaOrgFindManyMock).toHaveBeenCalledWith({
        where: {
          OR: [
            { ownerId: 'user_123' },
            {
              members: {
                some: {
                  userId: 'user_123',
                  status: 'ACTIVE',
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          members: {
            where: {
              userId: 'user_123',
            },
            select: {
              role: true,
              status: true,
              joinedAt: true,
            },
          },
          subscription: {
            select: {
              status: true,
              currentPeriodEnd: true,
              plan: {
                select: {
                  name: true,
                  features: true,
                },
              },
            },
          },
          _count: {
            select: {
              members: true,
              projects: true,
              apiKeys: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })
    })

    it('should return 401 for unauthenticated user', async () => {
      // Arrange
      mockGetUser.mockResolvedValue(null)
      const request = createMockNextRequest('GET', '/api/organizations')

      // Act
      const response = await GET(request)

      // Assert
      expect(response.status).toBe(401)
      expect(prismaOrgMemberFindManyMock).not.toHaveBeenCalled()
    })

    it('should return empty array when user has no organizations', async () => {
      // Arrange
      // mockGetUser is already set to return a user in beforeEach
      prismaOrgFindManyMock.mockResolvedValue([])

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
      // mockGetUser is already set to return a user in beforeEach
      prismaOrgFindManyMock.mockRejectedValue(new Error('Database connection failed'))

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
      prismaOrgFindUniqueMock.mockResolvedValue(null) // Slug not taken
      prismaOrgCreateMock.mockResolvedValue({
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

      expect(prismaOrgCreateMock).toHaveBeenCalledWith({
        data: {
          name: 'New Company',
          slug: 'new-company',
          description: 'A new organization',
          ownerId: mockUser.id,
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              members: true,
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
      expect(prismaOrgCreateMock).not.toHaveBeenCalled()
    })

    it('should return 409 for duplicate slug', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      const organizationData = {
        name: 'Duplicate Company',
        slug: 'existing-slug',
        description: 'This slug already exists',
      }
      prismaOrgFindUniqueMock.mockResolvedValue(
        createMockOrganization({ slug: 'existing-slug' }) as any
      )

      const request = createMockNextRequest('POST', '/api/organizations', organizationData)

      // Act
      const response = await POST(request)
      const data = await response.json()

      // Assert
      expect(response.status).toBe(409)
      expect(data.error).toBe('Organization slug already exists')
      expect(prismaOrgCreateMock).not.toHaveBeenCalled()
    })

    it('should return 401 for unauthenticated user', async () => {
      // Arrange
      mockGetUser.mockResolvedValue(null)
      const request = createMockNextRequest('POST', '/api/organizations', {
        name: 'Test Org',
        slug: 'test-org',
      })

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(401)
      expect(prismaOrgCreateMock).not.toHaveBeenCalled()
    })
  })

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })

      // Create request with malformed JSON
      const request = createMockNextRequest('POST', '/api/organizations', '{ invalid json }')

      // Act
      const response = await POST(request)

      // Assert
      expect(response.status).toBe(400)
    })

    it('should handle database transaction failures', async () => {
      // Arrange
      const mockUser = createMockUser({ id: 'user_123' })
      const organizationData = {
        // Declaring organizationData here
        name: 'Test Company',
        slug: 'test-company',
      }
      prismaOrgFindUniqueMock.mockResolvedValue(null)
      prismaOrgCreateMock.mockRejectedValue(new Error('Transaction failed'))

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
    mockGetUser.mockResolvedValue({
      user: createMockUser({ id: userId }),
    })
    return request
  },

  // Create unauthenticated request
  createUnauthenticatedRequest: (method: string, url: string, body?: any) => {
    const request = createMockNextRequest(method, url, body)
    mockGetUser.mockResolvedValue(null)
    return request
  },

  // Assert error response
  assertErrorResponse: async (
    response: Response,
    expectedStatus: number,
    expectedError?: string
  ) => {
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
      if (model === 'organization') {
        if (operation === 'findMany') prismaOrgFindManyMock.mockResolvedValue(returnValue)
        if (operation === 'create') prismaOrgCreateMock.mockResolvedValue(returnValue)
        if (operation === 'findUnique') prismaOrgFindUniqueMock.mockResolvedValue(returnValue)
      } else if (model === 'organizationMember') {
        if (operation === 'findMany') prismaOrgMemberFindManyMock.mockResolvedValue(returnValue)
        if (operation === 'findFirst') prismaOrgMemberFindFirstMock.mockResolvedValue(returnValue)
        if (operation === 'create') prismaOrgMemberCreateMock.mockResolvedValue(returnValue)
      } else if (model === 'subscription') {
        if (operation === 'findUnique')
          prismaSubscriptionFindUniqueMock.mockResolvedValue(returnValue)
      } else if (model === 'plan') {
        if (operation === 'findUnique') prismaPlanFindUniqueMock.mockResolvedValue(returnValue)
      }
    })
  },
}
