'use server'

import { revalidatePath } from 'next/cache'
import { isSignedIn } from '@/lib/auth/session'
import { NEW_JOB, parseReviewForm } from '@/lib/payslip/review'
import { createClient } from '@/lib/supabase/server'

export type SaveResult = { ok: true } | { ok: false; message: string }

const SESSION_EXPIRED = 'Your session expired. Sign in again.'
const SAVE_FAILED = "Couldn't save. Check your connection and try again."

/**
 * Saves one reviewed payslip: the payslip, its lines and a received income entry for the net, in one database call.
 * With `jobId = 'new'` the job is created first from `newJob`; saving again after a failure reuses a job of that name.
 */
export async function savePayslip(input: unknown): Promise<SaveResult> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { ok: false, message: SESSION_EXPIRED }
  const parsed = parseReviewForm(input)
  if (!parsed.ok) return parsed
  const { data } = parsed

  let jobId = data.jobId
  if (jobId === NEW_JOB && data.newJob) {
    const { data: existing } = await supabase.from('jobs').select('id').eq('name', data.newJob.name).maybeSingle()
    if (existing) jobId = existing.id
    else {
      const { data: created, error } = await supabase
        .from('jobs')
        .insert({ name: data.newJob.name, pay_frequency: data.newJob.payFrequency, first_pay_date: data.checkDate })
        .select('id')
        .single()
      if (error || !created) return { ok: false, message: SAVE_FAILED }
      jobId = created.id
    }
  }

  const { error } = await supabase.rpc('save_payslip', {
    p_job_id: jobId,
    p_check_date: data.checkDate,
    p_period_start: data.periodStart as string, // may be null: generated types never allow null arguments, but the function takes it
    p_period_end: data.periodEnd as string,
    p_pay_type: data.payType,
    p_gross: data.grossCents / 100,
    p_net: data.netCents / 100,
    p_reconciled: data.reconciled,
    p_parse_method: data.parseMethod,
    p_lines: data.lines.map((l) => ({ label: l.label, kind: l.kind, tag: l.tag, amount: l.cents / 100 })),
  })
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'This payslip is already saved (same job, date and net).' }
    if (error.code === 'P0002') return { ok: false, message: 'That job no longer exists. Pick another.' }
    return { ok: false, message: SAVE_FAILED }
  }

  revalidatePath('/')
  revalidatePath('/plan')
  revalidatePath('/summary')
  return { ok: true }
}
