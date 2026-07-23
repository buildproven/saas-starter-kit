import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

type UserRole = 'USER' | 'ADMIN' | 'SUPER_ADMIN'

const ROLE_RANK: Record<UserRole, number> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
}

const PROTECTED_ROUTES: Array<{ path: string; requiredRole: UserRole }> = [
  { path: '/dashboard', requiredRole: 'USER' },
  { path: '/organizations', requiredRole: 'USER' },
  { path: '/profile', requiredRole: 'USER' },
  { path: '/settings', requiredRole: 'USER' },
  { path: '/api/protected', requiredRole: 'USER' },
  { path: '/api/user', requiredRole: 'USER' },
  { path: '/api/billing', requiredRole: 'USER' },
  { path: '/api/organizations', requiredRole: 'USER' },
  { path: '/admin', requiredRole: 'ADMIN' },
  { path: '/api/admin', requiredRole: 'ADMIN' },
  { path: '/super-admin', requiredRole: 'SUPER_ADMIN' },
  { path: '/api/super-admin', requiredRole: 'SUPER_ADMIN' },
]
const PUBLIC_API_PATHS = ['/api/auth/callback', '/api/webhooks', '/api/health']

function getUserRole(role: unknown): UserRole {
  if (typeof role === 'string' && role in ROLE_RANK) {
    return role as UserRole
  }
  return 'USER'
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const protectedRoute = PROTECTED_ROUTES.find((route) =>
    request.nextUrl.pathname.startsWith(route.path)
  )
  const isPublicApiPath = PUBLIC_API_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (protectedRoute && !isPublicApiPath && !user) {
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/signin'
      url.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  if (protectedRoute && user) {
    const userRole = getUserRole(user.app_metadata?.role)
    if (ROLE_RANK[userRole] < ROLE_RANK[protectedRoute.requiredRole]) {
      if (request.nextUrl.pathname.startsWith('/api/')) {
        return NextResponse.json(
          { error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
          { status: 403 }
        )
      }

      const url = request.nextUrl.clone()
      url.pathname = '/unauthorized'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
