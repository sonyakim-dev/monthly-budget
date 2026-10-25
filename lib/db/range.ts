import type { MonthKey } from '@/lib/domain/dates'
import type { Db } from '@/lib/supabase/types'

/** The first month that has any data: an entry, a payslip, a bill or savings change, or an income source. */
export async function earliestDataMonth(supabase: Db): Promise<MonthKey | null> {
  const firsts = await Promise.all([
    supabase.from('transactions').select('d:date').order('date').limit(1).maybeSingle(),
    supabase.from('payslips').select('d:check_date').order('check_date').limit(1).maybeSingle(),
    supabase.from('bill_versions').select('d:effective_month').order('effective_month').limit(1).maybeSingle(),
    supabase.from('savings_plan_versions').select('d:effective_month').order('effective_month').limit(1).maybeSingle(),
    supabase.from('income_sources').select('d:start_date').order('start_date').limit(1).maybeSingle(),
  ])
  const dates = firsts.flatMap((r) => {
    if (r.error) throw new Error('Could not load the date range', { cause: r.error })
    return r.data ? [r.data.d] : []
  })
  return dates.length ? dates.sort()[0].slice(0, 7) : null
}
