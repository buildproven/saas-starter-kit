import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'

export type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

interface ProtectedApiOptions {
  requiredRole?: UserRole
  allowUnauthenticated?: boolean
}

export interface AuthenticatedUser {
  id: string
  email: string
  name?: string
  role: UserRole
}

export function withAuth<T = Record<string, string>>(
  handler: (
    request: NextRequest,
    context: { user: AuthenticatedUser | null; params?: T }
  ) => Promise<NextResponse>,
  options: ProtectedApiOptions = {}
) {
  return async function protectedHandler(
    request: NextRequest,
    context?: { params?: T }
  ): Promise<NextResponse> {
    try {
      const authUser = await getUser()

      if (!options.allowUnauthenticated && !authUser) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
      }

      const user: AuthenticatedUser | null = authUser
        ? {
            id: authUser.id,
            email: authUser.email,
            name: authUser.name || undefined,
            role: authUser.role,
          }
        : null

      if (options.requiredRole && user) {
        const hasAccess = checkRoleAccess(user.role, options.requiredRole)
        if (!hasAccess) {
          return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
        }
      }

      return await handler(request, { user, params: context?.params })
    } catch (error) {
      console.error('Auth middleware error:', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
  }
}

function checkRoleAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  const roleHierarchy = {
    USER: 1,
    ADMIN: 2,
    SUPER_ADMIN: 3,
  }

  const userLevel = roleHierarchy[userRole] || 0
  const requiredLevel = roleHierarchy[requiredRole] || 0

  return userLevel >= requiredLevel
}

export function canUserAccess(userRole: UserRole | null, requiredRole: UserRole): boolean {
  if (!userRole) return false
  return checkRoleAccess(userRole, requiredRole)
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const authUser = await getUser()

  if (!authUser) return null

  return {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name || undefined,
    role: authUser.role,
  }
}

type ApiHandler<T = Record<string, string>> = (
  request: NextRequest,
  context: { user: AuthenticatedUser | null; params?: T }
) => Promise<NextResponse>

export const withUserAuth = <T = Record<string, string>>(handler: ApiHandler<T>) =>
  withAuth(handler, { requiredRole: 'USER' })
export const withAdminAuth = <T = Record<string, string>>(handler: ApiHandler<T>) =>
  withAuth(handler, { requiredRole: 'ADMIN' })
export const withSuperAdminAuth = <T = Record<string, string>>(handler: ApiHandler<T>) =>
  withAuth(handler, { requiredRole: 'SUPER_ADMIN' })

const requestCounts = new Map<string, { count: number; resetTime: number }>()

export function rateLimit(ip: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now()
  const windowStart = now - windowMs

  const record = requestCounts.get(ip)

  if (!record || record.resetTime < windowStart) {
    requestCounts.set(ip, { count: 1, resetTime: now + windowMs })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  record.count++
  return true
}

export function corsHeaders(origin?: string) {
  const allowedOrigins = ['http://localhost:3000', 'https://yourdomain.com']

  const isAllowed = !origin || allowedOrigins.includes(origin)

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin || '*' : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  }
}
