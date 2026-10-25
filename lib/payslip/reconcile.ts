import type { ParsedPayslip } from './types'

/** gross − (pre-tax + taxes + post-tax) should equal net, within one cent of rounding. */
export function reconcile(p: Pick<ParsedPayslip, 'grossCents' | 'netCents' | 'lines'>): { ok: boolean; differenceCents: number } {
  const deducted = p.lines
    .filter((l) => l.kind === 'pretax' || l.kind === 'tax' || l.kind === 'posttax')
    .reduce((sum, l) => sum + l.cents, 0)
  const differenceCents = p.grossCents - deducted - p.netCents
  return { ok: Math.abs(differenceCents) <= 1, differenceCents }
}
