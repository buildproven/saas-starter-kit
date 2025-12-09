import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getUser, requireUser, requireAdmin } from './get-user'
import { createClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}))

const mockCreateClient = createClient as vi.Mock
const mockPrismaUserFindUnique = prisma.user.findUnique as vi.Mock
const mockPrismaUserCreate = prisma.user.create as vi.Mock

describe('getUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: null },
        }),
      },
    })

    const result = await getUser()

    expect(result).toBeNull()
    expect(mockPrismaUserFindUnique).not.toHaveBeenCalled()
  })

  it('returns existing user when authenticated and user exists in database', async () => {
    const mockAuthUser = {
      id: 'user_123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
        avatar_url: 'https://example.com/avatar.jpg',
      },
    }

    const mockDbUser = {
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/avatar.jpg',
      role: 'USER' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await getUser()

    expect(result).toEqual({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: 'https://example.com/avatar.jpg',
      role: 'USER',
    })

    expect(mockPrismaUserFindUnique).toHaveBeenCalledWith({
      where: { id: 'user_123' },
    })
    expect(mockPrismaUserCreate).not.toHaveBeenCalled()
  })

  it('creates new user when authenticated but user does not exist in database', async () => {
    const mockAuthUser = {
      id: 'user_new',
      email: 'newuser@example.com',
      user_metadata: {
        full_name: 'New User',
        avatar_url: 'https://example.com/new-avatar.jpg',
      },
    }

    const mockCreatedUser = {
      id: 'user_new',
      email: 'newuser@example.com',
      name: 'New User',
      image: 'https://example.com/new-avatar.jpg',
      role: 'USER' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(null)
    mockPrismaUserCreate.mockResolvedValueOnce(mockCreatedUser)

    const result = await getUser()

    expect(result).toEqual({
      id: 'user_new',
      email: 'newuser@example.com',
      name: 'New User',
      image: 'https://example.com/new-avatar.jpg',
      role: 'USER',
    })

    expect(mockPrismaUserCreate).toHaveBeenCalledWith({
      data: {
        id: 'user_new',
        email: 'newuser@example.com',
        name: 'New User',
        image: 'https://example.com/new-avatar.jpg',
      },
    })
  })

  it('creates user with null name and image when metadata is missing', async () => {
    const mockAuthUser = {
      id: 'user_minimal',
      email: 'minimal@example.com',
      user_metadata: {},
    }

    const mockCreatedUser = {
      id: 'user_minimal',
      email: 'minimal@example.com',
      name: null,
      image: null,
      role: 'USER' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(null)
    mockPrismaUserCreate.mockResolvedValueOnce(mockCreatedUser)

    const result = await getUser()

    expect(result).toEqual({
      id: 'user_minimal',
      email: 'minimal@example.com',
      name: null,
      image: null,
      role: 'USER',
    })

    expect(mockPrismaUserCreate).toHaveBeenCalledWith({
      data: {
        id: 'user_minimal',
        email: 'minimal@example.com',
        name: null,
        image: null,
      },
    })
  })

  it('returns user with ADMIN role', async () => {
    const mockAuthUser = {
      id: 'admin_123',
      email: 'admin@example.com',
      user_metadata: {
        full_name: 'Admin User',
      },
    }

    const mockDbUser = {
      id: 'admin_123',
      email: 'admin@example.com',
      name: 'Admin User',
      image: null,
      role: 'ADMIN' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await getUser()

    expect(result?.role).toBe('ADMIN')
  })

  it('returns user with SUPER_ADMIN role', async () => {
    const mockAuthUser = {
      id: 'superadmin_123',
      email: 'superadmin@example.com',
      user_metadata: {
        full_name: 'Super Admin',
      },
    }

    const mockDbUser = {
      id: 'superadmin_123',
      email: 'superadmin@example.com',
      name: 'Super Admin',
      image: null,
      role: 'SUPER_ADMIN' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await getUser()

    expect(result?.role).toBe('SUPER_ADMIN')
  })

  it('handles Supabase client creation errors', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('Supabase connection failed'))

    await expect(getUser()).rejects.toThrow('Supabase connection failed')
  })

  it('handles Supabase auth getUser errors', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockRejectedValueOnce(new Error('Auth error')),
      },
    })

    await expect(getUser()).rejects.toThrow('Auth error')
  })

  it('handles database findUnique errors', async () => {
    const mockAuthUser = {
      id: 'user_123',
      email: 'test@example.com',
      user_metadata: {},
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockRejectedValueOnce(new Error('Database error'))

    await expect(getUser()).rejects.toThrow('Database error')
  })

  it('handles database create errors', async () => {
    const mockAuthUser = {
      id: 'user_new',
      email: 'newuser@example.com',
      user_metadata: {},
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(null)
    mockPrismaUserCreate.mockRejectedValueOnce(new Error('Create failed'))

    await expect(getUser()).rejects.toThrow('Create failed')
  })
})

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns user when authenticated', async () => {
    const mockAuthUser = {
      id: 'user_123',
      email: 'test@example.com',
      user_metadata: {
        full_name: 'Test User',
      },
    }

    const mockDbUser = {
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await requireUser()

    expect(result).toEqual({
      id: 'user_123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      role: 'USER',
    })
  })

  it('throws UNAUTHORIZED error when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: null },
        }),
      },
    })

    await expect(requireUser()).rejects.toThrow('UNAUTHORIZED')
  })

  it('propagates errors from getUser', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('Connection error'))

    await expect(requireUser()).rejects.toThrow('Connection error')
  })
})

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns admin user when user has ADMIN role', async () => {
    const mockAuthUser = {
      id: 'admin_123',
      email: 'admin@example.com',
      user_metadata: {
        full_name: 'Admin User',
      },
    }

    const mockDbUser = {
      id: 'admin_123',
      email: 'admin@example.com',
      name: 'Admin User',
      image: null,
      role: 'ADMIN' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await requireAdmin()

    expect(result).toEqual({
      id: 'admin_123',
      email: 'admin@example.com',
      name: 'Admin User',
      image: null,
      role: 'ADMIN',
    })
  })

  it('returns super admin user when user has SUPER_ADMIN role', async () => {
    const mockAuthUser = {
      id: 'superadmin_123',
      email: 'superadmin@example.com',
      user_metadata: {
        full_name: 'Super Admin',
      },
    }

    const mockDbUser = {
      id: 'superadmin_123',
      email: 'superadmin@example.com',
      name: 'Super Admin',
      image: null,
      role: 'SUPER_ADMIN' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    const result = await requireAdmin()

    expect(result).toEqual({
      id: 'superadmin_123',
      email: 'superadmin@example.com',
      name: 'Super Admin',
      image: null,
      role: 'SUPER_ADMIN',
    })
  })

  it('throws FORBIDDEN error when user has USER role', async () => {
    const mockAuthUser = {
      id: 'user_123',
      email: 'user@example.com',
      user_metadata: {
        full_name: 'Regular User',
      },
    }

    const mockDbUser = {
      id: 'user_123',
      email: 'user@example.com',
      name: 'Regular User',
      image: null,
      role: 'USER' as const,
    }

    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: mockAuthUser },
        }),
      },
    })

    mockPrismaUserFindUnique.mockResolvedValueOnce(mockDbUser)

    await expect(requireAdmin()).rejects.toThrow('FORBIDDEN')
  })

  it('throws UNAUTHORIZED error when user is not authenticated', async () => {
    mockCreateClient.mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValueOnce({
          data: { user: null },
        }),
      },
    })

    await expect(requireAdmin()).rejects.toThrow('UNAUTHORIZED')
  })

  it('propagates errors from requireUser', async () => {
    mockCreateClient.mockRejectedValueOnce(new Error('Auth service unavailable'))

    await expect(requireAdmin()).rejects.toThrow('Auth service unavailable')
  })
})
