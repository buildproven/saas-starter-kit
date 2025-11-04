/**
 * Example: Role-Based Access Control Components
 *
 * This example shows how to implement role-based UI components
 * that conditionally render based on user permissions and roles.
 *
 * Copy and adapt these patterns for your specific needs.
 */

'use client'

import { ReactNode } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { UserRole, OrganizationRole } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Shield, Lock, User, Crown } from 'lucide-react'

// Basic role gate component
interface RoleGateProps {
  children: ReactNode
  allowedRoles: UserRole[]
  fallback?: ReactNode
  requireAllRoles?: boolean
}

export function RoleGate({
  children,
  allowedRoles,
  fallback = null,
  requireAllRoles = false
}: RoleGateProps) {
  const { user, hasRole } = useAuth()

  if (!user) return fallback

  const hasAccess = requireAllRoles
    ? allowedRoles.every(role => hasRole(role))
    : allowedRoles.some(role => hasRole(role))

  return hasAccess ? <>{children}</> : <>{fallback}</>
}

// Organization-specific role gate
interface OrgRoleGateProps {
  children: ReactNode
  organizationId: string
  allowedOrgRoles: OrganizationRole[]
  fallback?: ReactNode
}

export function OrgRoleGate({
  children,
  organizationId,
  allowedOrgRoles,
  fallback = null
}: OrgRoleGateProps) {
  const { hasOrgRole } = useAuth()

  const hasAccess = allowedOrgRoles.some(role =>
    hasOrgRole(organizationId, role)
  )

  return hasAccess ? <>{children}</> : <>{fallback}</>
}

// Feature gate based on subscription plan
interface FeatureGateProps {
  children: ReactNode
  feature: string
  organizationId: string
  fallback?: ReactNode
}

export function FeatureGate({
  children,
  feature,
  organizationId,
  fallback = <FeatureUpgradePrompt feature={feature} />
}: FeatureGateProps) {
  const { hasFeature } = useAuth()

  return hasFeature(organizationId, feature) ? <>{children}</> : <>{fallback}</>
}

// Upgrade prompt component
function FeatureUpgradePrompt({ feature }: { feature: string }) {
  return (
    <Alert>
      <Lock className="h-4 w-4" />
      <AlertDescription>
        The {feature} feature requires a Pro or Enterprise subscription.{' '}
        <Button variant="link" className="p-0 h-auto">
          Upgrade now
        </Button>
      </AlertDescription>
    </Alert>
  )
}

// Role indicator badge
interface RoleBadgeProps {
  role: UserRole | OrganizationRole
  className?: string
}

export function RoleBadge({ role, className }: RoleBadgeProps) {
  const getRoleConfig = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN':
        return { icon: Crown, color: 'bg-purple-100 text-purple-800', label: 'Super Admin' }
      case 'ADMIN':
        return { icon: Shield, color: 'bg-blue-100 text-blue-800', label: 'Admin' }
      case 'OWNER':
        return { icon: Crown, color: 'bg-yellow-100 text-yellow-800', label: 'Owner' }
      case 'MEMBER':
        return { icon: User, color: 'bg-gray-100 text-gray-800', label: 'Member' }
      default:
        return { icon: User, color: 'bg-gray-100 text-gray-800', label: role }
    }
  }

  const config = getRoleConfig(role)
  const Icon = config.icon

  return (
    <Badge className={`${config.color} ${className}`}>
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  )
}

// Advanced permission checker component
interface PermissionGateProps {
  children: ReactNode
  permissions: {
    userRole?: UserRole[]
    orgRole?: { organizationId: string; roles: OrganizationRole[] }[]
    features?: { organizationId: string; features: string[] }[]
    customCheck?: () => boolean
  }
  operator?: 'AND' | 'OR'
  fallback?: ReactNode
}

export function PermissionGate({
  children,
  permissions,
  operator = 'OR',
  fallback = null
}: PermissionGateProps) {
  const { user, hasRole, hasOrgRole, hasFeature } = useAuth()

  if (!user) return fallback

  const checks: boolean[] = []

  // Check user roles
  if (permissions.userRole) {
    checks.push(permissions.userRole.some(role => hasRole(role)))
  }

  // Check organization roles
  if (permissions.orgRole) {
    checks.push(
      permissions.orgRole.some(({ organizationId, roles }) =>
        roles.some(role => hasOrgRole(organizationId, role))
      )
    )
  }

  // Check features
  if (permissions.features) {
    checks.push(
      permissions.features.some(({ organizationId, features }) =>
        features.some(feature => hasFeature(organizationId, feature))
      )
    )
  }

  // Custom check
  if (permissions.customCheck) {
    checks.push(permissions.customCheck())
  }

  const hasAccess = operator === 'AND'
    ? checks.every(Boolean)
    : checks.some(Boolean)

  return hasAccess ? <>{children}</> : <>{fallback}</>
}

// Usage examples component
export function RoleBasedExamples() {
  return (
    <div className="space-y-6 p-6">
      <h2 className="text-2xl font-bold">Role-Based Access Examples</h2>

      {/* Basic role gate */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Admin Only Content</h3>
        <RoleGate
          allowedRoles={['ADMIN', 'SUPER_ADMIN']}
          fallback={<p className="text-gray-500">Admin access required</p>}
        >
          <Button variant="destructive">Delete All Data</Button>
        </RoleGate>
      </div>

      {/* Organization role gate */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Organization Management</h3>
        <OrgRoleGate
          organizationId="org_123"
          allowedOrgRoles={['OWNER', 'ADMIN']}
          fallback={<p className="text-gray-500">Organization admin required</p>}
        >
          <Button>Manage Team Settings</Button>
        </OrgRoleGate>
      </div>

      {/* Feature gate */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Premium Feature</h3>
        <FeatureGate
          feature="analytics"
          organizationId="org_123"
        >
          <Button>View Analytics Dashboard</Button>
        </FeatureGate>
      </div>

      {/* Advanced permission gate */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Complex Permissions</h3>
        <PermissionGate
          permissions={{
            userRole: ['ADMIN'],
            orgRole: [
              { organizationId: 'org_123', roles: ['OWNER'] }
            ],
            features: [
              { organizationId: 'org_123', features: ['advanced_settings'] }
            ]
          }}
          operator="OR"
          fallback={<p className="text-gray-500">Insufficient permissions</p>}
        >
          <Button variant="outline">Advanced Configuration</Button>
        </PermissionGate>
      </div>

      {/* Role badges */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Role Indicators</h3>
        <div className="flex gap-2">
          <RoleBadge role="SUPER_ADMIN" />
          <RoleBadge role="ADMIN" />
          <RoleBadge role="OWNER" />
          <RoleBadge role="MEMBER" />
        </div>
      </div>
    </div>
  )
}

/**
 * Extended useAuth hook with additional helpers
 * Add this to your existing useAuth hook
 */
export function useExtendedAuth() {
  const baseAuth = useAuth()

  // Check if user has access to specific organization
  const hasOrgAccess = (organizationId: string) => {
    return baseAuth.organizations?.some(org => org.id === organizationId)
  }

  // Check if user can perform action based on role hierarchy
  const canPerformAction = (
    action: string,
    context: { organizationId?: string; resourceId?: string }
  ) => {
    // Define action-role mappings
    const actionRoles: Record<string, { userRoles?: UserRole[]; orgRoles?: OrganizationRole[] }> = {
      'delete_organization': { orgRoles: ['OWNER'] },
      'manage_billing': { orgRoles: ['OWNER', 'ADMIN'] },
      'invite_members': { orgRoles: ['OWNER', 'ADMIN'] },
      'view_analytics': { orgRoles: ['OWNER', 'ADMIN', 'MEMBER'] },
      'system_admin': { userRoles: ['SUPER_ADMIN'] },
    }

    const requirements = actionRoles[action]
    if (!requirements) return false

    // Check user-level roles
    if (requirements.userRoles) {
      const hasUserRole = requirements.userRoles.some(role => baseAuth.hasRole(role))
      if (hasUserRole) return true
    }

    // Check organization-level roles
    if (requirements.orgRoles && context.organizationId) {
      return requirements.orgRoles.some(role =>
        baseAuth.hasOrgRole(context.organizationId!, role)
      )
    }

    return false
  }

  return {
    ...baseAuth,
    hasOrgAccess,
    canPerformAction,
  }
}

/**
 * Higher-order component for route protection
 */
export function withRoleProtection<T extends object>(
  WrappedComponent: React.ComponentType<T>,
  requiredRoles: UserRole[],
  fallbackComponent?: React.ComponentType
) {
  const ProtectedComponent = (props: T) => {
    const { user, hasRole } = useAuth()

    if (!user) {
      return <div>Please sign in to access this content.</div>
    }

    const hasAccess = requiredRoles.some(role => hasRole(role))

    if (!hasAccess) {
      const FallbackComponent = fallbackComponent || (() => (
        <div>You don't have permission to access this content.</div>
      ))
      return <FallbackComponent />
    }

    return <WrappedComponent {...props} />
  }

  ProtectedComponent.displayName = `withRoleProtection(${WrappedComponent.displayName || WrappedComponent.name})`

  return ProtectedComponent
}

// Usage example:
// const AdminPanel = withRoleProtection(
//   () => <div>Admin Panel Content</div>,
//   ['ADMIN', 'SUPER_ADMIN']
// )