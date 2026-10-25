'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { isSignedIn } from '@/lib/auth/session'
import { isValidIsoDate } from '@/lib/domain/dates'
import { createClient } from '@/lib/supabase/server'

export type JobResult = { ok: true } | { ok: false; message: string }

const SAVE_FAILED = "Couldn't save. Check your connection and try again."

const pct = z.number().min(0).max(100)
const schema = z.object({
  jobId: z.uuid(),
  effectiveDate: z.string().refine(isValidIsoDate),
  tradPct: pct,
  rothPct: pct,
  hsaMonthly: z.number().min(0),
})

/**
 * Records what a payslip showed as a pay change on the job: the 401(k) rates and monthly HSA from `effectiveDate`.
 * Everything else carries over from the pay entry in effect. An entry already on that date is updated instead, so
 * saving the same change twice does nothing new.
 */
export async function updateJobFromPayslip(input: unknown): Promise<JobResult> {
  const supabase = await createClient()
  if (!(await isSignedIn(supabase))) return { ok: false, message: 'Your session expired. Sign in again.' }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Check the figures.' }
  const { jobId, effectiveDate, tradPct, rothPct, hsaMonthly } = parsed.data

  const { data: current, error } = await supabase
    .from('job_pay_entries')
    .select('effective_date, kind, annual_salary, hourly_rate, hours_per_week, est_tax_pct, match_tiers, allowance_monthly, other_deductions_monthly')
    .eq('job_id', jobId)
    .neq('kind', 'end')
    .lte('effective_date', effectiveDate)
    .order('effective_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false, message: SAVE_FAILED }
  if (!current) return { ok: false, message: 'This job has no pay details on that date yet.' }

  const change = { trad_401k_pct: tradPct, roth_401k_pct: rothPct, hsa_monthly: hsaMonthly }
  const { error: writeError } =
    current.effective_date === effectiveDate
      ? await supabase.from('job_pay_entries').update(change).eq('job_id', jobId).eq('effective_date', effectiveDate)
      : await supabase.from('job_pay_entries').insert({
          job_id: jobId,
          effective_date: effectiveDate,
          kind: 'contribution_change',
          annual_salary: current.annual_salary,
          hourly_rate: current.hourly_rate,
          hours_per_week: current.hours_per_week,
          est_tax_pct: current.est_tax_pct,
          match_tiers: current.match_tiers,
          allowance_monthly: current.allowance_monthly,
          other_deductions_monthly: current.other_deductions_monthly,
          ...change,
        })
  if (writeError) return { ok: false, message: SAVE_FAILED }

  revalidatePath('/')
  revalidatePath('/plan')
  return { ok: true }
}
