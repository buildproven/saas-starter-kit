import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

const PROTECTED_PATHS = [
  '/dashboard',
  '/settings',
  '/api/user',
  '/api/billing',
  '/api/organizations',
]
const PUBLIC_API_PATHS = ['/api/auth/callback', '/api/webhooks', '/api/health']

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

  const isProtectedPath = PROTECTED_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))
  const isPublicApiPath = PUBLIC_API_PATHS.some((path) => request.nextUrl.pathname.startsWith(path))

  if (isProtectedPath && !isPublicApiPath && !user) {
    if (!request.nextUrl.pathname.startsWith('/api/')) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      url.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(url)
    }
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    )
  }

  return supabaseResponse
}
