'use client'

import { useRouter } from 'next/navigation'
import { ReactNode, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

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
  const { user, isLoading, canAccess } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    if (!user) {
      router.push(redirectTo)
      return
    }

    if (!canAccess(requiredRole)) {
      router.push('/unauthorized')
    }
  }, [user, isLoading, canAccess, router, requiredRole, redirectTo])

  // Show loading state
  if (isLoading) {
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
  if (!user) {
    if (fallback) return <>{fallback}</>
    return null // Will redirect
  }

  // Check role access
  if (!canAccess(requiredRole)) {
    if (fallback) return <>{fallback}</>
    return null // Will redirect
  }

  return <>{children}</>
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
