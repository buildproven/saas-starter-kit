import { renderHook } from '@testing-library/react'
import { useSession } from 'next-auth/react'
import type { Session } from 'next-auth'
import type { SessionContextValue } from 'next-auth/react'
import { useAuth, usePermissions, useOrganizationPermissions } from '../useAuth'

// Mock next-auth
vi.mock('next-auth/react')
const mockUseSession = useSession as vi.MockedFunction<typeof useSession>
const asAuthenticated = (session: Session): SessionContextValue => ({
  data: session,
  status: 'authenticated',
  update: vi.fn(),
})

const asStatus = (
  status: Exclude<SessionContextValue['status'], 'authenticated'>
): SessionContextValue => ({
  data: null,
  status,
  update: vi.fn(),
})

describe('useAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return loading state when session is loading', () => {
    mockUseSession.mockReturnValue(asStatus('loading'))

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
  })

  it('should return unauthenticated state when no session', () => {
    mockUseSession.mockReturnValue(asStatus('unauthenticated'))

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBe(null)
    expect(result.current.role).toBe(null)
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isSuperAdmin).toBe(false)
  })

  it('should return user data when authenticated', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        name: 'John Doe',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useAuth())

    expect(result.current.isLoading).toBe(false)
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual({
      id: '1',
      email: 'user@example.com',
      name: 'John Doe',
      role: 'USER',
    })
    expect(result.current.role).toBe('USER')
    expect(result.current.isAdmin).toBe(false)
    expect(result.current.isSuperAdmin).toBe(false)
  })

  it('should correctly identify admin user', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useAuth())

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isSuperAdmin).toBe(false)
    expect(result.current.canAccess('USER')).toBe(true)
    expect(result.current.canAccess('ADMIN')).toBe(true)
    expect(result.current.canAccess('SUPER_ADMIN')).toBe(false)
  })

  it('should correctly identify super admin user', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'superadmin@example.com',
        role: 'SUPER_ADMIN',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useAuth())

    expect(result.current.isAdmin).toBe(true)
    expect(result.current.isSuperAdmin).toBe(true)
    expect(result.current.canAccess('USER')).toBe(true)
    expect(result.current.canAccess('ADMIN')).toBe(true)
    expect(result.current.canAccess('SUPER_ADMIN')).toBe(true)
  })

  it('should handle role checks correctly', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

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
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        // No role property
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useAuth())

    expect(result.current.user?.role).toBe('USER')
    expect(result.current.role).toBeNull() // The hook returns null if no role in session
  })
})

describe('usePermissions', () => {
  it('should provide correct permission methods for admin user', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => usePermissions())

    expect(result.current.canViewAdminPanel()).toBe(true)
    expect(result.current.canManageUsers()).toBe(true)
    expect(result.current.canManageOrganizations()).toBe(true)
    expect(result.current.canAccessSuperAdmin()).toBe(false)
    expect(result.current.canDeleteUsers()).toBe(false)
    expect(result.current.canModifySystemSettings()).toBe(false)
  })

  it('should provide correct permission methods for super admin user', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'superadmin@example.com',
        role: 'SUPER_ADMIN',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => usePermissions())

    expect(result.current.canViewAdminPanel()).toBe(true)
    expect(result.current.canManageUsers()).toBe(true)
    expect(result.current.canManageOrganizations()).toBe(true)
    expect(result.current.canAccessSuperAdmin()).toBe(true)
    expect(result.current.canDeleteUsers()).toBe(true)
    expect(result.current.canModifySystemSettings()).toBe(true)
  })

  it('should deny all admin permissions for regular user', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

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
    mockUseSession.mockReturnValue(asStatus('unauthenticated'))

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    expect(result.current.isOrganizationMember).toBe(false)
    expect(result.current.organizationRole).toBeNull()
  })

  it('should return false when no organization ID provided', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useOrganizationPermissions())

    expect(result.current.isOrganizationMember).toBe(false)
    expect(result.current.organizationRole).toBeNull()
  })

  it('should return membership for authenticated user with org ID', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    expect(result.current.isOrganizationMember).toBe(true)
    expect(result.current.organizationRole).toBe('MEMBER')
  })

  it('should provide correct organization permissions for member role', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result } = renderHook(() => useOrganizationPermissions('org_123'))

    // MEMBER role - the default role in the hook
    expect(result.current.canEditOrganization).toBe(false)
    expect(result.current.canInviteMembers).toBe(false)
    expect(result.current.canViewBilling).toBe(false)
    expect(result.current.canDeleteOrganization).toBe(false)
  })

  it('should update when organization ID changes', () => {
    const mockSession: Session = {
      user: {
        id: '1',
        email: 'user@example.com',
        role: 'USER',
      },
      expires: '2025-01-01T00:00:00.000Z',
    }

    mockUseSession.mockReturnValue(asAuthenticated(mockSession))

    const { result, rerender } = renderHook(
      ({ orgId }) => useOrganizationPermissions(orgId),
      { initialProps: { orgId: 'org_123' } }
    )

    expect(result.current.isOrganizationMember).toBe(true)

    // Change to undefined
    rerender({ orgId: undefined })
    expect(result.current.isOrganizationMember).toBe(false)
  })
})
