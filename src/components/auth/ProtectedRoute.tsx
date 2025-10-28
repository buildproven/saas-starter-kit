'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ReactNode, useEffect } from 'react'

interface ProtectedRouteProps {
  children: ReactNode
  requiredRole?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
  fallback?: ReactNode
  redirectTo?: string
}

export function ProtectedRoute({
  children,
  requiredRole = 'USER',
  fallback,
  redirectTo = '/auth/signin',
}: ProtectedRouteProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return // Still loading

    if (!session) {
      router.push(redirectTo)
      return
    }

    // Check if user has required role
    const userRole = (session.user as { role?: string })?.role || 'USER'
    const hasAccess = checkRoleAccess(userRole, requiredRole)

    if (!hasAccess) {
      router.push('/unauthorized')
    }
  }, [session, status, router, requiredRole, redirectTo])

  // Show loading state
  if (status === 'loading') {
    if (fallback) return <>{fallback}</>

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // User not authenticated
  if (!session) {
    if (fallback) return <>{fallback}</>
    return null // Will redirect
  }

  // Check role access
  const userRole = (session.user as { role?: string })?.role || 'USER'
  const hasAccess = checkRoleAccess(userRole, requiredRole)

  if (!hasAccess) {
    if (fallback) return <>{fallback}</>
    return null // Will redirect
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

// Higher-order component version
export function withProtection<P extends object>(
  Component: React.ComponentType<P>,
  requiredRole?: 'USER' | 'ADMIN' | 'SUPER_ADMIN'
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute requiredRole={requiredRole}>
        <Component {...props} />
      </ProtectedRoute>
    )
  }
}
