'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { isEmailAllowed } from '@/lib/auth/allowlist'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { status: 'idle' | 'sent' | 'error'; message?: string }

const emailSchema = z.string().trim().toLowerCase().pipe(z.email())

export async function requestMagicLink(_prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(form.get('email'))
  if (!parsed.success) return { status: 'error', message: 'Enter a valid email address.' }

  // Same answer whether or not the email is allowed, so the form can't be used to probe the list.
  const sent: LoginState = { status: 'sent', message: 'If this email is allowed, a sign-in link is on its way.' }
  if (!isEmailAllowed(parsed.data, process.env.ALLOWED_EMAILS)) return sent

  const origin = (await headers()).get('origin') ?? 'http://localhost:3000'
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/confirm` },
  })
  // Unknown users (not invited yet) also get the neutral answer.
  if (error && error.code !== 'user_not_found' && error.code !== 'otp_disabled') {
    return { status: 'error', message: 'Could not send the link. Try again in a minute.' }
  }
  return sent
}
