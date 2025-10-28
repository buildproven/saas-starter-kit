import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

// Define route access levels
const RouteAccess = {
  PUBLIC: 'public',
  AUTHENTICATED: 'authenticated',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const

type RouteAccessType = (typeof RouteAccess)[keyof typeof RouteAccess]

// Define protected route patterns and their required access levels
const protectedRoutes: Array<{ pattern: RegExp; access: RouteAccessType }> = [
  // Dashboard routes - require authentication
  { pattern: /^\/dashboard/, access: RouteAccess.AUTHENTICATED },

  // Organization management - require authentication
  { pattern: /^\/organizations/, access: RouteAccess.AUTHENTICATED },

  // User profile and settings
  { pattern: /^\/profile/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/settings/, access: RouteAccess.AUTHENTICATED },

  // API routes that need authentication
  { pattern: /^\/api\/protected/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/api\/organizations/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/api\/user/, access: RouteAccess.AUTHENTICATED },

  // Admin routes
  { pattern: /^\/admin/, access: RouteAccess.ADMIN },
  { pattern: /^\/api\/admin/, access: RouteAccess.ADMIN },

  // Super admin routes
  { pattern: /^\/super-admin/, access: RouteAccess.SUPER_ADMIN },
  { pattern: /^\/api\/super-admin/, access: RouteAccess.SUPER_ADMIN },
]

// Public routes that don't need authentication
const publicRoutes: RegExp[] = [
  /^\/$/, // Home page
  /^\/auth\/.*/, // Auth pages
  /^\/api\/auth\/.*/, // NextAuth API routes
  /^\/api\/health$/, // Health check
  /^\/api\/hello$/, // Public hello API
  /^\/about$/, // About page
  /^\/contact$/, // Contact page
  /^\/pricing$/, // Pricing page
  /^\/privacy$/, // Privacy policy
  /^\/terms$/, // Terms of service
  /^\/_next\/.*/, // Next.js static files
  /^\/favicon\.ico$/, // Favicon
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((pattern) => pattern.test(pathname))
}

function getRequiredAccess(pathname: string): RouteAccessType | null {
  const route = protectedRoutes.find((route) => route.pattern.test(pathname))
  return route?.access ?? null
}

function hasRequiredAccess(userRole: string | undefined, requiredAccess: RouteAccessType): boolean {
  if (requiredAccess === RouteAccess.PUBLIC) return true
  if (requiredAccess === RouteAccess.AUTHENTICATED) return !!userRole
  if (requiredAccess === RouteAccess.ADMIN)
    return userRole === 'ADMIN' || userRole === 'SUPER_ADMIN'
  if (requiredAccess === RouteAccess.SUPER_ADMIN) return userRole === 'SUPER_ADMIN'
  return false
}

// Reserved for future custom middleware logic

// NextAuth middleware configuration
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const token = req.nextauth.token

    // Check if route requires specific access level
    const requiredAccess = getRequiredAccess(pathname)

    if (requiredAccess && !hasRequiredAccess(token?.role as string, requiredAccess)) {
      // Redirect to unauthorized page or login
      if (!token) {
        // Not authenticated - redirect to login
        return NextResponse.redirect(new URL('/auth/signin', req.url))
      } else {
        // Authenticated but insufficient permissions - redirect to unauthorized
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl

        // Allow public routes
        if (isPublicRoute(pathname)) return true

        // For protected routes, require authentication
        const requiredAccess = getRequiredAccess(pathname)
        if (requiredAccess === RouteAccess.AUTHENTICATED) {
          return !!token
        }

        // For admin/super-admin routes, check role
        if (requiredAccess === RouteAccess.ADMIN) {
          return token?.role === 'ADMIN' || token?.role === 'SUPER_ADMIN'
        }

        if (requiredAccess === RouteAccess.SUPER_ADMIN) {
          return token?.role === 'SUPER_ADMIN'
        }

        // Default to allowing access for routes not in our config
        return true
      },
    },
  }
)

// Specify which routes this middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
