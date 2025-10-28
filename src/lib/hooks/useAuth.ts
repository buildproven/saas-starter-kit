import { useSession } from 'next-auth/react'
import { useMemo } from 'react'

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

interface AuthUser {
  id: string
  email: string
  name?: string
  image?: string
  role: UserRole
}

interface UseAuthReturn {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  role: UserRole | null
  hasRole: (role: UserRole) => boolean
  hasAnyRole: (roles: UserRole[]) => boolean
  hasAllRoles: (roles: UserRole[]) => boolean
  isAdmin: boolean
  isSuperAdmin: boolean
  canAccess: (requiredRole: UserRole) => boolean
}

export function useAuth(): UseAuthReturn {
  const { data: session, status } = useSession()

  const authData = useMemo(() => {
    const isLoading = status === 'loading'
    const isAuthenticated = !!session?.user
    const sessionUser = session?.user as {
      id?: string
      email?: string
      name?: string
      image?: string
      role?: UserRole
    }
    const userRole = sessionUser?.role || null

    const user: AuthUser | null = session?.user
      ? {
          id: sessionUser?.id || '',
          email: session.user.email || '',
          name: session.user.name || undefined,
          image: session.user.image || undefined,
          role: userRole || 'USER',
        }
      : null

    const roleHierarchy = {
      USER: 1,
      ADMIN: 2,
      SUPER_ADMIN: 3,
    }

    const hasRole = (role: UserRole): boolean => {
      if (!userRole) return false
      return userRole === role
    }

    const hasAnyRole = (roles: UserRole[]): boolean => {
      if (!userRole) return false
      return roles.includes(userRole)
    }

    const hasAllRoles = (roles: UserRole[]): boolean => {
      if (!userRole) return false
      return roles.every((role) => hasRole(role))
    }

    const canAccess = (requiredRole: UserRole): boolean => {
      if (!userRole) return false
      const userLevel = roleHierarchy[userRole] || 0
      const requiredLevel = roleHierarchy[requiredRole] || 0
      return userLevel >= requiredLevel
    }

    const isAdmin = canAccess('ADMIN')
    const isSuperAdmin = canAccess('SUPER_ADMIN')

    return {
      user,
      isAuthenticated,
      isLoading,
      role: userRole,
      hasRole,
      hasAnyRole,
      hasAllRoles,
      isAdmin,
      isSuperAdmin,
      canAccess,
    }
  }, [session, status])

  return authData
}

// Hook for checking permissions
export function usePermissions() {
  const { canAccess, hasRole, hasAnyRole, hasAllRoles, isAdmin, isSuperAdmin } = useAuth()

  return {
    canAccess,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isAdmin,
    isSuperAdmin,
    // Convenience methods for common checks
    canViewAdminPanel: () => canAccess('ADMIN'),
    canManageUsers: () => canAccess('ADMIN'),
    canManageOrganizations: () => canAccess('ADMIN'),
    canAccessSuperAdmin: () => canAccess('SUPER_ADMIN'),
    canDeleteUsers: () => canAccess('SUPER_ADMIN'),
    canModifySystemSettings: () => canAccess('SUPER_ADMIN'),
  }
}

// Hook for organization-specific permissions
export function useOrganizationPermissions(organizationId?: string) {
  const { isAuthenticated } = useAuth()

  // This would typically fetch organization membership from your API
  // For now, we'll use placeholder logic
  const isOrganizationMember = useMemo(() => {
    if (!isAuthenticated || !organizationId) return false
    // TODO: Implement actual organization membership check
    return true
  }, [isAuthenticated, organizationId])

  const organizationRole = useMemo(() => {
    if (!isOrganizationMember) return null
    // TODO: Fetch actual organization role from API
    // This would typically be: 'OWNER', 'ADMIN', 'MEMBER', 'VIEWER'
    return 'MEMBER' as 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'
  }, [isOrganizationMember])

  return {
    isOrganizationMember,
    organizationRole,
    canEditOrganization: organizationRole === 'OWNER' || organizationRole === 'ADMIN',
    canInviteMembers: organizationRole === 'OWNER' || organizationRole === 'ADMIN',
    canViewBilling: organizationRole === 'OWNER',
    canDeleteOrganization: organizationRole === 'OWNER',
  }
}
