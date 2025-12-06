import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

const RouteAccess = {
  PUBLIC: 'public',
  AUTHENTICATED: 'authenticated',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
} as const

type RouteAccessType = (typeof RouteAccess)[keyof typeof RouteAccess]

const protectedRoutes: Array<{ pattern: RegExp; access: RouteAccessType }> = [
  { pattern: /^\/dashboard/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/organizations/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/profile/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/settings/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/api\/protected/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/api\/organizations/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/api\/user/, access: RouteAccess.AUTHENTICATED },
  { pattern: /^\/admin/, access: RouteAccess.ADMIN },
  { pattern: /^\/api\/admin/, access: RouteAccess.ADMIN },
  { pattern: /^\/super-admin/, access: RouteAccess.SUPER_ADMIN },
  { pattern: /^\/api\/super-admin/, access: RouteAccess.SUPER_ADMIN },
]

const publicRoutes: RegExp[] = [
  /^\/$/,
  /^\/login$/,
  /^\/signup$/,
  /^\/api\/auth\/callback/,
  /^\/api\/webhooks/,
  /^\/api\/health$/,
  /^\/api\/hello$/,
  /^\/about$/,
  /^\/contact$/,
  /^\/pricing$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/_next\/.*/,
  /^\/favicon\.ico$/,
]

function isPublicRoute(pathname: string): boolean {
  return publicRoutes.some((pattern) => pattern.test(pathname))
}

function getRequiredAccess(pathname: string): RouteAccessType | null {
  const route = protectedRoutes.find((route) => route.pattern.test(pathname))
  return route?.access ?? null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (isPublicRoute(pathname)) {
    return updateSession(request)
  }

  const requiredAccess = getRequiredAccess(pathname)
  if (!requiredAccess) {
    return updateSession(request)
  }

  return updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
