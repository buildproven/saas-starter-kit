'use client'

import { useSession } from 'next-auth/react'
import { ReactNode } from 'react'

interface RoleGateProps {
  children: ReactNode
  allowedRoles: Array<'USER' | 'ADMIN' | 'SUPER_ADMIN'>
  fallback?: ReactNode
  requireAll?: boolean // Require all roles (AND) vs any role (OR)
}

export function RoleGate({
  children,
  allowedRoles,
  fallback = null,
  requireAll = false,
}: RoleGateProps) {
  const { data: session } = useSession()

  if (!session) {
    return <>{fallback}</>
  }

  const userRole = (session.user as { role?: string })?.role || 'USER'
  const hasAccess = requireAll
    ? allowedRoles.every((role) => checkRoleAccess(userRole, role))
    : allowedRoles.some((role) => checkRoleAccess(userRole, role))

  if (!hasAccess) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

function checkRoleAccess(userRole: string, requiredRole: string): boolean {
  const roleHierarchy = {
    USER: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3,
  }

  const userLevel = roleHierarchy[userRole as keyof typeof roleHierarchy] || 0
  const requiredLevel = roleHierarchy[requiredRole as keyof typeof roleHierarchy] || 0

  return userLevel >= requiredLevel
}

// Convenience components for common use cases
export function AdminOnly({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <RoleGate allowedRoles={['ADMIN']} fallback={fallback}>
      {children}
    </RoleGate>
  )
}

export function SuperAdminOnly({
  children,
  fallback,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return (
    <RoleGate allowedRoles={['SUPER_ADMIN']} fallback={fallback}>
      {children}
    </RoleGate>
  )
}

export function AuthenticatedOnly({
  children,
  fallback,
}: {
  children: ReactNode
  fallback?: ReactNode
}) {
  return (
    <RoleGate allowedRoles={['USER']} fallback={fallback}>
      {children}
    </RoleGate>
  )
}
