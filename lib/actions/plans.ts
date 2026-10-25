'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSignedIn } from '@/lib/auth/session'
import { addDays, formatDate, formatMonthShort, isValidIsoDate, parseMonthKey } from '@/lib/domain/dates'
import {
  nextGroupColor,
  parseAddIncomeForm,
  parseBillForm,
  parseGroupForm,
  parseIncomeForm,
  parseIncomeScope,
  parseSavingsForm,
  parseScope,
  type AddIncomeErrors,
  type ApplyScope,
  type BillErrors,
  type BillInput,
  type GroupErrors,
  type IncomeErrors,
  type SavingsErrors,
} from '@/lib/domain/plan-input'
import { createClient } from '@/lib/supabase/server'
import type { Db } from '@/lib/supabase/types'

export type PlanFormState = { ok?: boolean; errors?: BillErrors & GroupErrors & SavingsErrors & IncomeErrors & AddIncomeErrors; message?: string; notice?: string }

const SESSION_EXPIRED = 'Your session expired. Sign in again.'
const NOT_FOUND = 'Bill not found.'
const SAVE_FAILED = "Couldn't save. Check your connection and try again."
const GROUP_NOT_FOUND = 'Group not found.'
const GROUP_TAKEN = 'You already have a group with this name.'

/**
 * The group a bill goes into. A new group is found by name or created at the end with the next unused color,
 * so saving again after a failure reuses it instead of making a second one.
 */
async function resolveGroup(supabase: Db, input: BillInput): Promise<{ id: string } | { failed: PlanFormState }> {
  if (input.newGroup === null) return { id: input.groupId }
  const name = input.newGroup
  const { data: groups, error } = await supabase.from('bill_groups').select('id, name, color, sort')
  if (error) return { failed: { message: SAVE_FAILED } }
  const same = groups.find((g) => g.name === name)
  if (same) return { id: same.id }

  const { data: created, error: createError } = await supabase
    .from('bill_groups')
    .insert({ name, color: nextGroupColor(groups.map((g) => g.color)), sort: Math.max(0, ...groups.map((g) => g.sort)) + 1 })
    .select('id')
    .single()
  if (createError?.code === '23505') {
    // Added by another save at the same moment: use that one.
    const { data: existing } = await supabase.from('bill_groups').select('id').eq('name', name).maybeSingle()
    if (existing) return { id: existing.id }
  }
  if (createError || !created) return { failed: { message: SAVE_FAILED } }
  return { id: created.id }
}

/**
 * Saves the bill sheet. Name, group and due day apply to every month.
 * `scope` is sent only when the amount changed:
 *   month: just this month — a single payment recorded this month is corrected; otherwise the plan changes for this month only.
 *   later: the plan changes from this month on, and a single payment recorded this month is corrected too.
 * Every write is safe to repeat, so retrying after a failure never duplicates anything.
 */
export async function saveBill(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }

  const id = String(form.get('id') ?? '')
  const month = parseMonthKey(String(form.get('month') ?? ''))
  if (!z.uuid().safeParse(id).success || !month) return { message: NOT_FOUND }
  const parsed = parseBillForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, dueDay } = parsed.data
  const scope = parseScope(form.get('scope'))
  const group = await resolveGroup(supabase, parsed.data)
  if ('failed' in group) return group.failed

  // Details first, so a name clash doesn't leave the amount half-changed.
  const { data: updated, error } = await supabase.from('bills').update({ name, group_id: group.id, due_day: dueDay }).eq('id', id).select('id')
  if (error) {
    if (error.code === '23505') return { errors: { name: 'You already have a bill with this name.' } }
    if (error.code === '23503') return { errors: { groupId: 'Choose a group.' } }
    return { message: SAVE_FAILED }
  }
  if (!updated.length) return { message: NOT_FOUND }

  if (scope) {
    const result = await applyAmount(supabase, 'bill', id, month, amountCents, scope)
    if (result) return result
  }

  revalidatePath('/')
  return { ok: true }
}

/** Saves the savings sheet, the same way as `saveBill`: name and day apply to every month, the amount as `scope` says. */
export async function saveSavingsPlan(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }

  const id = String(form.get('id') ?? '')
  const month = parseMonthKey(String(form.get('month') ?? ''))
  if (!z.uuid().safeParse(id).success || !month) return { message: PLANS.saving.notFound }
  const parsed = parseSavingsForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, day } = parsed.data
  const scope = parseScope(form.get('scope'))

  const { data: updated, error } = await supabase.from('savings_plans').update({ name, day_of_month: day }).eq('id', id).select('id')
  if (error) return error.code === '23505' ? { errors: { name: 'You already have a savings plan with this name.' } } : { message: SAVE_FAILED }
  if (!updated.length) return { message: PLANS.saving.notFound }

  if (scope) {
    const result = await applyAmount(supabase, 'saving', id, month, amountCents, scope)
    if (result) return result
  }

  revalidatePath('/')
  return { ok: true }
}

const PLANS = {
  income: { notFound: 'Income not found.' },
  bill: { notFound: NOT_FOUND, several: (n: number, month: string) => `This bill was paid in ${n} payments in ${month}, so only later months can change here.` },
  saving: { notFound: 'Savings plan not found.', several: (n: number, month: string) => `This saving was made in ${n} transfers in ${month}, so only later months can change here.` },
}

function setPlanAmount(supabase: Db, kind: 'bill' | 'saving', id: string, month: string, amountCents: number, onlyThisMonth: boolean) {
  const args = { p_month: `${month}-01`, p_amount: amountCents / 100, p_only_this_month: onlyThisMonth }
  if (kind === 'bill') return supabase.rpc('set_bill_amount', { p_bill_id: id, ...args })
  return supabase.rpc('set_savings_amount', { p_plan_id: id, ...args })
}

/** A single payment or transfer recorded this month is corrected; otherwise (or for later months) the plan changes. */
async function applyAmount(supabase: Db, kind: 'bill' | 'saving', id: string, month: string, amountCents: number, scope: ApplyScope): Promise<PlanFormState | null> {
  const { data: payments, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('kind', kind)
    .eq(kind === 'bill' ? 'bill_id' : 'savings_plan_id', id)
    .eq('month', `${month}-01`)
  if (error) return { message: SAVE_FAILED }
  if (scope === 'month' && payments.length > 1) return { message: PLANS[kind].several(payments.length, formatMonthShort(month)) }

  if (payments.length === 1) {
    const { error: paymentError } = await supabase.from('transactions').update({ amount: amountCents / 100 }).eq('id', payments[0].id)
    if (paymentError) return { message: SAVE_FAILED }
  }
  if (scope === 'later' || payments.length === 0) {
    const { error: planError } = await setPlanAmount(supabase, kind, id, month, amountCents, scope === 'month')
    if (planError) return { message: planError.code === 'P0002' ? PLANS[kind].notFound : SAVE_FAILED }
  }
  return null
}

/**
 * Adds a bill that repeats every month from `month` (scope 'later'), or a one-time bill in `month` only (scope 'month').
 * A removed bill with the same name is restarted instead, keeping its history.
 * It all happens in one database call, so it lands completely or not at all.
 */
export async function addBill(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }

  const month = parseMonthKey(String(form.get('month') ?? ''))
  if (!month) return { message: SAVE_FAILED }
  const parsed = parseBillForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, dueDay } = parsed.data
  const oneTime = parseScope(form.get('scope')) === 'month'
  const group = await resolveGroup(supabase, parsed.data)
  if ('failed' in group) return group.failed

  const { data: restarted, error } = await supabase.rpc('add_bill', {
    p_name: name,
    p_group_id: group.id,
    p_due_day: dueDay as number, // may be null: generated types never allow null arguments, but the function takes it
    p_month: `${month}-01`,
    p_amount: amountCents / 100,
    p_only_this_month: oneTime,
  })
  if (error) {
    if (error.code === '23505') return { errors: { name: 'You already have a bill with this name.' } }
    if (error.code === '23503') return { errors: { groupId: 'Choose a group.' } }
    return { message: SAVE_FAILED }
  }

  revalidatePath('/')
  if (!restarted) return { ok: true }
  const label = formatMonthShort(month)
  return { ok: true, notice: oneTime ? `${name} added for ${label}` : `${name} restarted from ${label}` }
}

/**
 * Adds a savings plan that repeats every month from `month` (scope 'later'), or a one-time saving in `month` only (scope 'month').
 * A removed plan with the same name is restarted instead, keeping its history. One database call, like `addBill`.
 */
export async function addSavingsPlan(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }

  const month = parseMonthKey(String(form.get('month') ?? ''))
  if (!month) return { message: SAVE_FAILED }
  const parsed = parseSavingsForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, day } = parsed.data
  const oneTime = parseScope(form.get('scope')) === 'month'

  const { data: restarted, error } = await supabase.rpc('add_savings_plan', {
    p_name: name,
    p_day: day as number, // may be null: generated types never allow null arguments, but the function takes it
    p_month: `${month}-01`,
    p_amount: amountCents / 100,
    p_only_this_month: oneTime,
  })
  if (error) return error.code === '23505' ? { errors: { name: 'You already have a savings plan with this name.' } } : { message: SAVE_FAILED }

  revalidatePath('/')
  if (!restarted) return { ok: true }
  const label = formatMonthShort(month)
  return { ok: true, notice: oneTime ? `${name} added for ${label}` : `${name} restarted from ${label}` }
}

/** Removes a bill or savings plan for just this month (a skip) or from this month on. Earlier months keep their amounts. */
async function removePlan(kind: 'bill' | 'saving', id: string, monthText: string, scopeText: string): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  const month = parseMonthKey(monthText)
  const scope = parseScope(scopeText)
  if (!z.uuid().safeParse(id).success || !month || !scope) return { message: PLANS[kind].notFound }

  const { data: plan } =
    kind === 'bill'
      ? await supabase.from('bills').select('name').eq('id', id).maybeSingle()
      : await supabase.from('savings_plans').select('name').eq('id', id).maybeSingle()
  if (!plan) return { message: PLANS[kind].notFound }
  const { error } = await setPlanAmount(supabase, kind, id, month, 0, scope === 'month')
  if (error) return { message: error.code === 'P0002' ? PLANS[kind].notFound : SAVE_FAILED }

  revalidatePath('/')
  const label = formatMonthShort(month)
  return { ok: true, notice: scope === 'month' ? `${plan.name} removed for ${label} only` : `${plan.name} removed from ${label}` }
}

export async function removeBill(id: string, monthText: string, scopeText: string) {
  return removePlan('bill', id, monthText, scopeText)
}

export async function removeSavingsPlan(id: string, monthText: string, scopeText: string) {
  return removePlan('saving', id, monthText, scopeText)
}

/**
 * Saves the income sheet. Name, how often, the end date and the category apply to every payment; the amount
 * applies as `scope` says (sent only when it changed), relative to the payment the sheet was opened from (`date`):
 *   one:   that payment alone is recorded as a received entry for the new amount; the plan is unchanged.
 *   all:   every payment, from the first.
 *   later: that payment and the ones after it.
 */
export async function saveIncome(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }

  const id = String(form.get('id') ?? '')
  const date = String(form.get('date') ?? '')
  if (!z.uuid().safeParse(id).success || !isValidIsoDate(date)) return { message: PLANS.income.notFound }
  const parsed = parseIncomeForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, frequency, endDate, categoryId } = parsed.data
  const scope = parseIncomeScope(form.get('scope'))

  const { data: updated, error } = await supabase
    .from('income_sources')
    .update({ name, frequency, end_date: endDate, category_id: categoryId })
    .eq('id', id)
    .select('id, start_date')
  if (error) {
    if (error.code === '23514') return { errors: { endDate: 'End on or after the first payment.' } }
    if (error.code === '23503') return { errors: { categoryId: 'Choose a category.' } }
    return { message: SAVE_FAILED }
  }
  if (!updated.length) return { message: PLANS.income.notFound }

  if (scope === 'one') {
    const result = await recordIncomePayment(supabase, id, date, amountCents, name, categoryId)
    if (result) return result
  } else if (scope) {
    const { error: amountError } = await supabase.rpc('set_income_amount', { p_source_id: id, p_from: date, p_amount: amountCents / 100, p_scope: scope })
    if (amountError) return { message: amountError.code === 'P0002' ? PLANS.income.notFound : SAVE_FAILED }
  }

  revalidatePath('/')
  return { ok: true }
}

/** One payment of other income for a different amount: a received entry on that date, linked to the source. Saving again updates it. */
async function recordIncomePayment(supabase: Db, sourceId: string, date: string, amountCents: number, name: string, categoryId: string): Promise<PlanFormState | null> {
  const { data: existing, error } = await supabase.from('transactions').select('id').eq('income_source_id', sourceId).eq('date', date).maybeSingle()
  if (error) return { message: SAVE_FAILED }
  const amount = amountCents / 100
  const { error: writeError } = existing
    ? await supabase.from('transactions').update({ amount }).eq('id', existing.id)
    : await supabase.from('transactions').insert({ date, kind: 'income', amount, name, category_id: categoryId, income_source_id: sourceId, source: 'manual' })
  return writeError ? { message: SAVE_FAILED } : null
}

/**
 * Removes other income: just the payment the sheet was opened from (skipped), that payment and later ones (the
 * source ends the day before; it is deleted if nothing would be left), or all of it (deleted). Recorded payments stay.
 */
export async function removeIncome(id: string, date: string, scopeText: string): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  const scope = parseIncomeScope(scopeText)
  if (!z.uuid().safeParse(id).success || !isValidIsoDate(date) || !scope) return { message: PLANS.income.notFound }
  if (scope === 'one') {
    const result = await setIncomeSkipped(id, date, true)
    return result.ok ? { ok: true, notice: `Payment on ${formatDate(date)} skipped` } : result
  }

  const { data: plan } = await supabase.from('income_sources').select('name, start_date').eq('id', id).maybeSingle()
  if (!plan) return { message: PLANS.income.notFound }
  const endsAll = scope === 'all' || date <= plan.start_date
  const { error } = endsAll
    ? await supabase.from('income_sources').delete().eq('id', id)
    : await supabase.from('income_sources').update({ end_date: addDays(date, -1) }).eq('id', id)
  if (error) return { message: SAVE_FAILED }

  revalidatePath('/')
  return { ok: true, notice: endsAll ? `${plan.name} removed` : `${plan.name} removed from ${formatDate(date)}` }
}

/** Renames or recolors a bill group. */
export async function saveGroup(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  const id = String(form.get('id') ?? '')
  if (!z.uuid().safeParse(id).success) return { message: GROUP_NOT_FOUND }
  const parsed = parseGroupForm(form)
  if (!parsed.ok) return { errors: parsed.errors }

  const { data: updated, error } = await supabase.from('bill_groups').update(parsed.data).eq('id', id).select('id')
  if (error) return error.code === '23505' ? { errors: { name: GROUP_TAKEN } } : { message: SAVE_FAILED }
  if (!updated.length) return { message: GROUP_NOT_FOUND }

  revalidatePath('/')
  return { ok: true }
}

/** Deletes a bill group. The database refuses while any bill (stopped ones too) is still in it. */
export async function deleteGroup(id: string): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  if (!z.uuid().safeParse(id).success) return { message: GROUP_NOT_FOUND }

  const { data: deleted, error } = await supabase.from('bill_groups').delete().eq('id', id).select('name')
  if (error) return { message: error.code === '23503' ? 'Only an empty group can be deleted.' : SAVE_FAILED }
  if (!deleted.length) return { message: GROUP_NOT_FOUND }

  revalidatePath('/')
  return { ok: true, notice: `${deleted[0].name} deleted` }
}

const ORDER_FAILED = "Couldn't save the order. Check your connection and try again."
const allIds = (ids: string[]) => ids.length > 0 && ids.every((id) => z.uuid().safeParse(id).success)

/** Saves the order of a group's bills shown on the Bills card. It applies to every month. */
export async function reorderBills(groupId: string, billIds: string[]): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  if (!allIds([groupId, ...billIds])) return { message: ORDER_FAILED }
  const { error } = await supabase.rpc('reorder_bills', { p_group_id: groupId, p_bill_ids: billIds })
  if (error) return { message: ORDER_FAILED }
  revalidatePath('/')
  return { ok: true }
}

/** Saves the order of the bill groups shown on the Bills card. It applies to every month. */
export async function reorderGroups(groupIds: string[]): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  if (!allIds(groupIds)) return { message: ORDER_FAILED }
  const { error } = await supabase.rpc('reorder_bill_groups', { p_group_ids: groupIds })
  if (error) return { message: ORDER_FAILED }
  revalidatePath('/')
  return { ok: true }
}

/** Adds other income (not a paycheck): once on its date, or repeating from its first payment. One database call. */
export async function addIncome(form: FormData): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  const parsed = parseAddIncomeForm(form)
  if (!parsed.ok) return { errors: parsed.errors }
  const { amountCents, name, frequency, date, categoryId } = parsed.data

  const { error } = await supabase.rpc('add_income', {
    p_name: name,
    p_category_id: categoryId,
    p_frequency: frequency,
    p_start_date: date,
    p_amount: amountCents / 100,
  })
  if (error) return error.code === '23503' ? { errors: { categoryId: 'Choose a category.' } } : { message: SAVE_FAILED }

  revalidatePath('/')
  return { ok: true }
}

/** Marks one payment of other income as not coming, or undoes that. Safe to repeat. */
export async function setIncomeSkipped(sourceId: string, date: string, skipped: boolean): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  if (!z.uuid().safeParse(sourceId).success || !isValidIsoDate(date)) return { message: SAVE_FAILED }
  const { error } = skipped
    ? await supabase.from('skipped_income').upsert({ source_id: sourceId, pay_date: date }, { onConflict: 'source_id,pay_date', ignoreDuplicates: true })
    : await supabase.from('skipped_income').delete().eq('source_id', sourceId).eq('pay_date', date)
  if (error) return { message: error.code === '23503' ? PLANS.income.notFound : SAVE_FAILED }
  revalidatePath('/')
  return { ok: true }
}

/** Marks a payday estimated from a job as not happening, or undoes that. Safe to repeat. */
export async function setPaydaySkipped(jobId: string, date: string, skipped: boolean): Promise<PlanFormState> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { message: SESSION_EXPIRED }
  if (!z.uuid().safeParse(jobId).success || !isValidIsoDate(date)) return { message: SAVE_FAILED }
  const { error } = skipped
    ? await supabase.from('skipped_paydays').upsert({ job_id: jobId, pay_date: date }, { onConflict: 'job_id,pay_date', ignoreDuplicates: true })
    : await supabase.from('skipped_paydays').delete().eq('job_id', jobId).eq('pay_date', date)
  if (error) return { message: SAVE_FAILED }
  revalidatePath('/')
  return { ok: true }
}
