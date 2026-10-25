'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSignedIn } from '@/lib/auth/session'
import { parseEntryForm, type EntryErrors, type EntryKind } from '@/lib/domain/entry-input'
import { createClient } from '@/lib/supabase/server'
import type { Db } from '@/lib/supabase/types'

export type EntryFormState = { ok?: boolean; errors?: EntryErrors; message?: string }

const PAYSLIP_LOCKED = "This entry comes from a payslip and can't be changed here."
const SAVE_FAILED = 'Could not save. Try again.'
const CATEGORY_TAKEN = 'You already have a category with this name.'

/**
 * The category a new one is saved into: found by name (so saving again after a failure reuses it) or
 * created at the end of its kind. Names are unique across kinds, so a clash with the other kind is an error.
 */
async function resolveCategory(supabase: Db, kind: 'income' | 'expense', name: string): Promise<{ id: string } | { failed: EntryFormState }> {
  const { data: all, error } = await supabase.from('categories').select('id, name, kind, sort')
  if (error) return { failed: { message: SAVE_FAILED } }
  const same = all.find((c) => c.name === name)
  if (same) return same.kind === kind ? { id: same.id } : { failed: { errors: { newCategory: CATEGORY_TAKEN } } }

  const sort = Math.max(0, ...all.filter((c) => c.kind === kind).map((c) => c.sort)) + 1
  const { data: created, error: createError } = await supabase.from('categories').insert({ kind, name, sort }).select('id').single()
  if (createError?.code === '23505') {
    // Added by another save at the same moment: use that one.
    const { data: existing } = await supabase.from('categories').select('id, kind').eq('name', name).maybeSingle()
    if (existing?.kind === kind) return { id: existing.id }
    return { failed: { errors: { newCategory: CATEGORY_TAKEN } } }
  }
  if (createError || !created) return { failed: { message: SAVE_FAILED } }
  return { id: created.id }
}

/** Creates an expense (no id) or updates any entry (with id). */
export async function saveEntry(_prev: EntryFormState, form: FormData): Promise<EntryFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: 'Your session expired. Sign in again.' }

  const id = String(form.get('id') ?? '')
  let kind: EntryKind = 'expense'
  if (id) {
    if (!z.uuid().safeParse(id).success) return { message: 'Entry not found.' }
    const { data: existing } = await supabase.from('transactions').select('kind, source').eq('id', id).maybeSingle()
    if (!existing) return { message: 'Entry not found.' }
    if (existing.source === 'payslip') return { message: PAYSLIP_LOCKED }
    kind = existing.kind as EntryKind
  }

  const parsed = parseEntryForm(form, kind)
  if (!parsed.ok) return { errors: parsed.errors }
  let categoryId = parsed.data.categoryId
  if (parsed.data.newCategory !== null && (kind === 'income' || kind === 'expense')) {
    const category = await resolveCategory(supabase, kind, parsed.data.newCategory)
    if ('failed' in category) return category.failed
    categoryId = category.id
  }
  const row = {
    amount: parsed.data.amountCents / 100,
    name: parsed.data.name,
    date: parsed.data.date,
    ...(kind === 'income' || kind === 'expense' ? { category_id: categoryId } : {}),
  }

  const { error } = id
    ? await supabase.from('transactions').update(row).eq('id', id)
    : await supabase.from('transactions').insert({ ...row, kind: 'expense', source: 'manual' })
  if (error) {
    // 23514: the category doesn't fit this kind of entry (checked by the database).
    if (error.code === '23514') return { errors: { categoryId: 'Choose a category for this kind of entry.' } }
    return { message: SAVE_FAILED }
  }

  revalidatePath('/')
  return { ok: true }
}

export async function deleteEntry(id: string): Promise<EntryFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: 'Your session expired. Sign in again.' }
  if (!z.uuid().safeParse(id).success) return { message: 'Entry not found.' }

  const { data: existing } = await supabase.from('transactions').select('source').eq('id', id).maybeSingle()
  if (!existing) return { message: 'Entry not found.' }
  if (existing.source === 'payslip') return { message: PAYSLIP_LOCKED }

  const { error } = await supabase.from('transactions').delete().eq('id', id)
  if (error) return { message: 'Could not delete. Try again.' }
  revalidatePath('/')
  return { ok: true }
}
