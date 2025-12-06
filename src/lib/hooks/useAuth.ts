import { useAuth as useSupabaseAuth } from '@/hooks/use-auth'
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
  const { user: supabaseUser, loading } = useSupabaseAuth()

  const authData = useMemo(() => {
    const isLoading = loading
    const isAuthenticated = !!supabaseUser
    const userRole: UserRole | null = isAuthenticated ? 'USER' : null

    const user: AuthUser | null = supabaseUser
      ? {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          name: supabaseUser.user_metadata?.full_name || undefined,
          image: supabaseUser.user_metadata?.avatar_url || undefined,
          role: 'USER',
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
  }, [supabaseUser, loading])

  return authData
}

export function usePermissions() {
  const { canAccess, hasRole, hasAnyRole, hasAllRoles, isAdmin, isSuperAdmin } = useAuth()

  return {
    canAccess,
    hasRole,
    hasAnyRole,
    hasAllRoles,
    isAdmin,
    isSuperAdmin,
    canViewAdminPanel: () => canAccess('ADMIN'),
    canManageUsers: () => canAccess('ADMIN'),
    canManageOrganizations: () => canAccess('ADMIN'),
    canAccessSuperAdmin: () => canAccess('SUPER_ADMIN'),
    canDeleteUsers: () => canAccess('SUPER_ADMIN'),
    canModifySystemSettings: () => canAccess('SUPER_ADMIN'),
  }
}

export function useOrganizationPermissions(organizationId?: string) {
  const { isAuthenticated } = useAuth()

  const isOrganizationMember = useMemo(() => {
    if (!isAuthenticated || !organizationId) return false
    return true
  }, [isAuthenticated, organizationId])

  const organizationRole = useMemo(() => {
    if (!isOrganizationMember) return null
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
