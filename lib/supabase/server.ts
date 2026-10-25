import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getPublicEnv } from '@/lib/env'
import type { Database } from './database.types'
import type { Db } from './types'

/** Supabase client bound to the current request's cookies. */
export async function createClient(): Promise<Db> {
  const cookieStore = await cookies()
  const { supabaseUrl, supabasePublishableKey } = getPublicEnv()
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options)
        } catch {
          // Called from a Server Component, which can't set cookies.
          // proxy.ts refreshes the session on every request, so this is safe to ignore.
        }
      },
    },
  })
}
