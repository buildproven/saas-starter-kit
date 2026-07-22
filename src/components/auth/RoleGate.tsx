'use client'

import { ReactNode } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

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
  const { user, canAccess } = useAuth()

  if (!user) {
    return <>{fallback}</>
  }

  const hasAccess = requireAll
    ? allowedRoles.every((role) => canAccess(role))
    : allowedRoles.some((role) => canAccess(role))

  if (!hasAccess) {
    return <>{fallback}</>
  }

  return <>{children}</>
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
