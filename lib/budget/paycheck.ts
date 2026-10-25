import { addDays } from '@/lib/domain/dates'
import { occurrences } from './schedule'

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'

/** One slice of the employer match: `matchPct` of the next `ofPct` of pay the employee puts in. */
export type MatchTier = { matchPct: number; ofPct: number }

export type PayEntry = {
  date: string
  kind: 'start' | 'raise' | 'promotion' | 'contribution_change' | 'end'
  annualSalary: number | null
  hourlyRate: number | null
  hoursPerWeek: number | null
  taxPct: number
  tradPct: number
  rothPct: number
  /** In order; a flat match is one tier, e.g. 100% of the first 6%. Empty means no match. */
  matchTiers: MatchTier[]
  allowanceMonthly: number
  hsaMonthly: number
  otherMonthly: number
}

export type Job = { id: string; name: string; payFrequency: PayFrequency; firstPayDate: string | null; entries: PayEntry[] }

const PER_YEAR: Record<PayFrequency, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 }
export const paychecksPerYear = (frequency: PayFrequency) => PER_YEAR[frequency]

const cents = (dollars: number) => Math.round(dollars * 100)

/** The employer match as a percentage of gross, for an employee contributing `employeePct` of gross. */
export function matchPercent(tiers: MatchTier[], employeePct: number) {
  let remaining = Math.max(0, employeePct)
  let match = 0
  for (const tier of tiers) {
    const slice = Math.min(remaining, tier.ofPct)
    match += (slice * tier.matchPct) / 100
    remaining -= slice
  }
  return match
}

/** Estimated take-home for one paycheck under the given terms. Percentages are 0–100. */
export function estimatePaycheck(entry: PayEntry, frequency: PayFrequency) {
  const n = PER_YEAR[frequency]
  const annual = entry.annualSalary ?? (entry.hourlyRate ?? 0) * (entry.hoursPerWeek ?? 0) * 52
  const grossCents = cents(annual / n + (entry.allowanceMonthly * 12) / n)
  const pct = (p: number) => Math.round((grossCents * p) / 100)
  const trad = pct(entry.tradPct)
  const roth = pct(entry.rothPct)
  const hsa = cents((entry.hsaMonthly * 12) / n)
  const other = cents((entry.otherMonthly * 12) / n)
  const tax = pct(entry.taxPct)
  return {
    grossCents,
    netCents: grossCents - trad - hsa - tax - roth - other,
    employee401kCents: trad + roth,
    tradCents: trad,
    rothCents: roth,
    matchCents: pct(matchPercent(entry.matchTiers, entry.tradPct + entry.rothPct)),
    hsaCents: hsa,
  }
}

/** Pay dates in [from, to] while the job is active, each with the pay terms in effect that day. */
export function payDates(job: Job, from: string, to: string): { date: string; entry: PayEntry }[] {
  const entries = [...job.entries].sort((a, b) => a.date.localeCompare(b.date))
  const paying = entries.filter((e) => e.kind !== 'end')
  if (paying.length === 0) return []
  const start = paying[0].date
  const end = entries.filter((e) => e.kind === 'end').at(-1)?.date ?? null

  const firstPay =
    job.firstPayDate ??
    (job.payFrequency === 'weekly' ? addDays(start, 7) : job.payFrequency === 'biweekly' ? addDays(start, 14) : start)
  const frequency = job.payFrequency
  return occurrences({ frequency, start: firstPay, end }, from, to)
    .filter((date) => date >= start)
    .map((date) => ({ date, entry: paying.filter((e) => e.date <= date).at(-1)! }))
}
