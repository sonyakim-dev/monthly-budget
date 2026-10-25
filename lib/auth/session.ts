import { isEmailAllowed } from '@/lib/auth/allowlist'
import type { Db } from '@/lib/supabase/types'

/** Server actions check this first: a valid session for an allowed email. */
export async function isSignedIn(supabase: Db) {
  const { data } = await supabase.auth.getClaims()
  return Boolean(data?.claims) && isEmailAllowed(data?.claims.email as string | undefined, process.env.ALLOWED_EMAILS)
}
