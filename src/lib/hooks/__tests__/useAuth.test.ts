import { renderHook } from '@testing-library/react'
import { useAuth, usePermissions, useOrganizationPermissions } from '../useAuth'

const mockUseSupabaseAuth = vi.fn()

vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockUseSupabaseAuth(),
}))

interface MockUserMetadata {
  full_name?: string
  avatar_url?: string
}

interface MockAppMetadata {
  role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
}

interface MockUser {
  id: string
  email: string
  user_metadata: MockUserMetadata
  app_metadata: MockAppMetadata
}

const makeUser = (overrides: Partial<MockUser> = {}): MockUser => ({
  id: '1',
  email: 'user@example.com',
  user_metadata: { full_name: 'John Doe', avatar_url: 'https://example.com/avatar.png' },
  app_metadata: { role: 'USER' },
  ...overrides,
})

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return loading state when session is loading', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: null, loading: true })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('should return unauthenticated state when no session', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: null, loading: false })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
    expect(result.current.role).toBe(null)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isSuperAdmin).toBe(false)
  })

  it('should return user data when authenticated', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: makeUser(), loading: false })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({
      id: '1',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'USER',
      image: 'https://example.com/avatar.png',
    })
    expect(result.current.role).toBe('USER')
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isSuperAdmin).toBe(false)
  })

  it('should correctly identify admin user', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ email: 'admin@example.com', app_metadata: { role: 'ADMIN' } }),
      loading: false,
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isSuperAdmin).toBe(false)
    expect(result.current.canAccess('USER')).toBe(true)
    expect(result.current.canAccess('ADMIN')).toBe(true)
    expect(result.current.canAccess('SUPER_ADMIN')).toBe(false)
  })

  it('should correctly identify super admin user', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ email: 'superadmin@example.com', app_metadata: { role: 'SUPER_ADMIN' } }),
      loading: false,
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isSuperAdmin).toBe(true)
    expect(result.current.canAccess('USER')).toBe(true)
    expect(result.current.canAccess('ADMIN')).toBe(true)
    expect(result.current.canAccess('SUPER_ADMIN')).toBe(true)
  })

  it('should handle role checks correctly', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ email: 'admin@example.com', app_metadata: { role: 'ADMIN' } }),
      loading: false,
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.hasRole('ADMIN')).toBe(true)
    expect(result.current.hasRole('USER')).toBe(false)
    expect(result.current.hasRole('SUPER_ADMIN')).toBe(false)

    expect(result.current.hasAnyRole(['USER', 'ADMIN'])).toBe(true)
    expect(result.current.hasAnyRole(['USER', 'SUPER_ADMIN'])).toBe(false)

    expect(result.current.hasAllRoles(['ADMIN'])).toBe(true)
    expect(result.current.hasAllRoles(['ADMIN', 'SUPER_ADMIN'])).toBe(false)
  })

  it('should default to USER role when no role provided', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ app_metadata: {} }),
      loading: false,
    })

    const { result } = renderHook(() => useAuth())

    expect(result.current.user?.role).toBe('USER')
    expect(result.current.role).toBe('USER')
  })
})

describe('usePermissions', () => {
  it('should provide correct permission methods for admin user', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ email: 'admin@example.com', app_metadata: { role: 'ADMIN' } }),
      loading: false,
    })

    const { result } = renderHook(() => usePermissions())

    expect(result.current.canViewAdminPanel()).toBe(true)
    expect(result.current.canManageUsers()).toBe(true)
    expect(result.current.canManageOrganizations()).toBe(true)
    expect(result.current.canAccessSuperAdmin()).toBe(false)
    expect(result.current.canDeleteUsers()).toBe(false)
    expect(result.current.canModifySystemSettings()).toBe(false)
  })

  it('should provide correct permission methods for super admin user', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ email: 'superadmin@example.com', app_metadata: { role: 'SUPER_ADMIN' } }),
      loading: false,
    })

    const { result } = renderHook(() => usePermissions())

    expect(result.current.canViewAdminPanel()).toBe(true)
    expect(result.current.canManageUsers()).toBe(true)
    expect(result.current.canManageOrganizations()).toBe(true)
    expect(result.current.canAccessSuperAdmin()).toBe(true)
    expect(result.current.canDeleteUsers()).toBe(true)
    expect(result.current.canModifySystemSettings()).toBe(true)
  })

  it('should deny all admin permissions for regular user', () => {
    mockUseSupabaseAuth.mockReturnValue({
      user: makeUser({ app_metadata: { role: 'USER' } }),
      loading: false,
    })

    const { result } = renderHook(() => usePermissions())

    expect(result.current.canViewAdminPanel()).toBe(false)
    expect(result.current.canManageUsers()).toBe(false)
    expect(result.current.canManageOrganizations()).toBe(false)
    expect(result.current.canAccessSuperAdmin()).toBe(false)
    expect(result.current.canDeleteUsers()).toBe(false)
    expect(result.current.canModifySystemSettings()).toBe(false)
  })
})

describe('useOrganizationPermissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return false for membership when not authenticated', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: null, loading: false })

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    expect(result.current.isOrganizationMember).toBe(false)
    expect(result.current.organizationRole).toBeNull()
  })

  it('should return false when no organization ID provided', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: makeUser(), loading: false })

    const { result } = renderHook(() => useOrganizationPermissions())

    expect(result.current.isOrganizationMember).toBe(false)
    expect(result.current.organizationRole).toBeNull()
  })

  it('should return membership for authenticated user with org ID', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: makeUser(), loading: false })

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    expect(result.current.isOrganizationMember).toBe(true)
    expect(result.current.organizationRole).toBe('MEMBER')
  })

  it('should provide correct organization permissions for member role', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: makeUser(), loading: false })

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    // MEMBER role - the default role in the hook
    expect(result.current.canEditOrganization).toBe(false)
    expect(result.current.canInviteMembers).toBe(false)
    expect(result.current.canViewBilling).toBe(false)
    expect(result.current.canDeleteOrganization).toBe(false)
  })

  it('should update when organization ID changes', () => {
    mockUseSupabaseAuth.mockReturnValue({ user: makeUser(), loading: false })

    const { result, rerender } = renderHook(({ orgId }) => useOrganizationPermissions(orgId), {
      initialProps: { orgId: 'org_123' },
    })

    expect(result.current.isOrganizationMember).toBe(true)

    // Change to undefined - test fallback behavior with empty string
    rerender({ orgId: '' })
    expect(result.current.isOrganizationMember).toBe(false)
  })
})
