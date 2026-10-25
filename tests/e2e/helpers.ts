import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import type { Database } from '../../lib/supabase/database.types'

/** Fixed test accounts. Only the "owner*" ones are put on the allowlist for the test server. */
export const E2E_EMAILS = {
  auth: 'owner-auth@example.test',
  dashboard: 'owner-dashboard@example.test',
} as const

export const STRANGER_EMAIL = 'stranger@example.test'

export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('E2E tests need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local')
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Deletes the user (and, by cascade, all their rows) if present, then creates them fresh. Returns the new id. */
export async function resetUser(email: string): Promise<string> {
  const client = admin()
  const { data: list, error: listError } = await client.auth.admin.listUsers({ perPage: 1000 })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === email)
  if (existing) {
    const { error } = await client.auth.admin.deleteUser(existing.id)
    if (error) throw error
  }
  const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true })
  if (error) throw error
  return data.user.id
}

/** Signs in through the real /auth/confirm route using a server-generated magic-link token. */
export async function signIn(page: Page, email: string) {
  const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email })
  if (error) throw error
  await page.goto(`/auth/confirm?token_hash=${data.properties.hashed_token}&type=magiclink`)
}

/**
 * Throws unless the user is a test account (@example.test). Call before any test writes,
 * because the tests share the local database with the owner's real data.
 */
export async function assertTestUser(userId: string) {
  const { data, error } = await admin().auth.admin.getUserById(userId)
  if (error || !data.user.email?.endsWith('@example.test')) {
    throw new Error(`Refusing to write test data for a non-test account (${userId})`)
  }
}
