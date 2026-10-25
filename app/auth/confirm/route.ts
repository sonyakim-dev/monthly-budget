import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { isEmailAllowed } from '@/lib/auth/allowlist'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type') as EmailOtpType | null
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin))

  if (!tokenHash || !type) return to('/login?error=link')

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
  if (error || !data.user) return to('/login?error=link')

  if (!isEmailAllowed(data.user.email, process.env.ALLOWED_EMAILS)) {
    await supabase.auth.signOut()
    return to('/login?error=not-allowed')
  }

  const { error: seedError } = await supabase.rpc('seed_defaults')
  if (seedError) throw seedError
  return to('/')
}
