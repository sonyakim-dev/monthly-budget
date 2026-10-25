// What a payslip implies versus what Jobs says for that date. Shown under the lines on review; changes nothing.
import { estimatePaycheck, matchPercent, paychecksPerYear, type Job, type MatchTier, type PayEntry } from '@/lib/budget/paycheck'
import { formatMoney } from '@/lib/domain/money'

export type VerifyLine = { kind: 'earning' | 'pretax' | 'tax' | 'posttax' | 'employer'; tag: string; cents: number }
export type VerifyRow = { what: string; payslip: string; job: string; status: 'ok' | 'differs' | 'info' }

const RATE_TOLERANCE = 0.25 // percentage points
const CENTS_TOLERANCE = 100

const rate = (cents: number, gross: number) => (cents / gross) * 100
const pct = (p: number) => (p === 0 ? '0%' : `${p.toFixed(1)}%`)
const close = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance
const verdict = (same: boolean): VerifyRow['status'] => (same ? 'ok' : 'differs')

/** "100% on first 3%, 50% on next 2%"; a flat match is one tier. */
export function describeTiers(tiers: MatchTier[]) {
  if (tiers.length === 0) return 'no match'
  return tiers.map((t, i) => `${t.matchPct}% on ${i === 0 ? 'first' : 'next'} ${t.ofPct}%`).join(', ')
}

/** The pay terms in effect on a date: the latest paying entry on or before it. */
export function entryInEffect(job: Job, date: string): PayEntry | null {
  return (
    [...job.entries]
      .filter((e) => e.kind !== 'end' && e.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1) ?? null
  )
}

export type PayChange = { effectiveDate: string; tradPct: number; rothPct: number; hsaMonthly: number; summary: string }

const tenth = (p: number) => Math.round(p * 10) / 10

/**
 * The pay change a payslip implies for the job: its 401(k) rates and monthly HSA, effective from the pay period
 * start (or the check date). Null when nothing differs from the pay entry in effect, or there is none.
 */
export function proposePayChange(
  payslip: { checkDate: string; periodStart: string | null; grossCents: number; lines: VerifyLine[] },
  job: Job,
): PayChange | null {
  const entry = entryInEffect(job, payslip.checkDate)
  if (!entry || payslip.grossCents <= 0) return null
  const sum = (tag: string, kind?: VerifyLine['kind']) => payslip.lines.filter((l) => l.tag === tag && (!kind || l.kind === kind)).reduce((s, l) => s + l.cents, 0)
  const trad = tenth(rate(sum('trad_401k'), payslip.grossCents))
  const roth = tenth(rate(sum('roth_401k'), payslip.grossCents))
  const hsaMonthly = Math.round((sum('hsa', 'pretax') * paychecksPerYear(job.payFrequency)) / 12) / 100

  const changes: string[] = []
  if (!close(trad, entry.tradPct, RATE_TOLERANCE)) changes.push(`401(k) ${trad}%`)
  if (!close(roth, entry.rothPct, RATE_TOLERANCE)) changes.push(`Roth ${roth}%`)
  if (!close(hsaMonthly, entry.hsaMonthly, 1)) changes.push(`HSA $${hsaMonthly}/mo`)
  if (changes.length === 0) return null
  return {
    effectiveDate: payslip.periodStart ?? payslip.checkDate,
    tradPct: close(trad, entry.tradPct, RATE_TOLERANCE) ? entry.tradPct : trad,
    rothPct: close(roth, entry.rothPct, RATE_TOLERANCE) ? entry.rothPct : roth,
    hsaMonthly: close(hsaMonthly, entry.hsaMonthly, 1) ? entry.hsaMonthly : hsaMonthly,
    summary: changes.join(', '),
  }
}

/**
 * Rows comparing the payslip (with its lines as currently tagged) to the job. Null when there is nothing
 * to compare: no pay entry in effect on the check date, or no gross to take percentages of.
 */
export function verifyAgainstJob(payslip: { checkDate: string; grossCents: number; lines: VerifyLine[] }, job: Job): VerifyRow[] | null {
  const entry = entryInEffect(job, payslip.checkDate)
  if (!entry || payslip.grossCents <= 0) return null
  const gross = payslip.grossCents
  const sum = (tag: string, kind?: VerifyLine['kind']) => payslip.lines.filter((l) => l.tag === tag && (!kind || l.kind === kind)).reduce((s, l) => s + l.cents, 0)
  const expected = estimatePaycheck(entry, job.payFrequency)

  const trad = rate(sum('trad_401k'), gross)
  const roth = rate(sum('roth_401k'), gross)
  const matchCents = sum('401k_match')
  const match = rate(matchCents, gross)
  const matchFromJob = matchPercent(entry.matchTiers, trad + roth)
  const hsaCents = sum('hsa', 'pretax')
  const taxes = rate(payslip.lines.filter((l) => l.kind === 'tax').reduce((s, l) => s + l.cents, 0), gross)
  const salary = entry.annualSalary !== null ? `$${entry.annualSalary.toLocaleString('en-US', { maximumFractionDigits: 0 })}/yr` : `$${entry.hourlyRate}/hr × ${entry.hoursPerWeek}h`

  return [
    { what: '401(k) traditional', payslip: `${pct(trad)}${trad ? ' of gross' : ''}`, job: pct(entry.tradPct), status: verdict(close(trad, entry.tradPct, RATE_TOLERANCE)) },
    { what: '401(k) Roth', payslip: `${pct(roth)}${roth ? ' of gross' : ''}`, job: pct(entry.rothPct), status: verdict(close(roth, entry.rothPct, RATE_TOLERANCE)) },
    {
      what: 'Employer match',
      payslip: `${formatMoney(matchCents)} = ${pct(match)}`,
      job: entry.matchTiers.length ? `${pct(matchFromJob)} · ${describeTiers(entry.matchTiers)}` : describeTiers(entry.matchTiers),
      status: verdict(close(match, matchFromJob, RATE_TOLERANCE)),
    },
    {
      what: 'HSA',
      payslip: formatMoney(hsaCents),
      job: entry.hsaMonthly ? `$${entry.hsaMonthly}/mo ≈ ${formatMoney(expected.hsaCents)}` : 'none',
      status: verdict(close(hsaCents, expected.hsaCents, CENTS_TOLERANCE)),
    },
    { what: 'Taxes', payslip: `${pct(taxes)} of gross`, job: `${entry.taxPct}% (estimate)`, status: 'info' },
    {
      what: 'Gross per paycheck',
      payslip: formatMoney(gross),
      job: `${formatMoney(expected.grossCents)} from ${salary}`,
      status: close(gross, expected.grossCents, CENTS_TOLERANCE) ? 'ok' : 'info',
    },
  ]
}
