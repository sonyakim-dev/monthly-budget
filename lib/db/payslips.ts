import type { SavedPayslipRef } from '@/components/plan/payslip-list'
import { toCents } from '@/lib/domain/money'
import type { Db } from '@/lib/supabase/types'

/** Every saved payslip, newest first. */
export async function loadSavedPayslips(supabase: Db): Promise<SavedPayslipRef[]> {
  const { data, error } = await supabase
    .from('payslips')
    .select('id, check_date, pay_type, net, reconciled, jobs ( name ), payslip_lines ( id )')
    .order('check_date', { ascending: false })
  if (error) throw new Error('Could not load payslips', { cause: error })
  return data.map((p) => ({
    id: p.id,
    employer: p.jobs?.name ?? '',
    checkDate: p.check_date,
    netCents: toCents(p.net),
    payType: p.pay_type,
    reconciled: p.reconciled,
    lineCount: p.payslip_lines.length,
  }))
}
