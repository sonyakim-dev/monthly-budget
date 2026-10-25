import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isEmailAllowed } from '@/lib/auth/allowlist'
import { getPublicEnv } from '@/lib/env'
import type { Database } from './database.types'

const PUBLIC_PATHS = ['/login', '/auth']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function redirectWithCookies(request: NextRequest, response: NextResponse, pathname: string, search = '') {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = search
  const redirect = NextResponse.redirect(url)
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
  return redirect
}

/** Refreshes the auth session and keeps signed-out or non-allowlisted users out of the app. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request })
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()

  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value)
      },
    },
  })

  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  const pathname = request.nextUrl.pathname

  if (claims && !isEmailAllowed(claims.email as string | undefined, process.env.ALLOWED_EMAILS)) {
    await supabase.auth.signOut()
    return pathname === '/login' ? response : redirectWithCookies(request, response, '/login', '?error=not-allowed')
  }
  if (!claims && !isPublic(pathname)) return redirectWithCookies(request, response, '/login')
  if (claims && pathname === '/login') return redirectWithCookies(request, response, '/')
  return response
}
