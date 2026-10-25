import { describe, expect, it } from 'vitest'
import type { Job, PayEntry } from '@/lib/budget/paycheck'
import { proposePayChange, verifyAgainstJob, type VerifyLine } from './verify'

const entry = (over: Partial<PayEntry> = {}): PayEntry => ({
  date: '2026-01-01',
  kind: 'start',
  annualSalary: 95000,
  hourlyRate: null,
  hoursPerWeek: null,
  taxPct: 24,
  tradPct: 5,
  rothPct: 0,
  matchTiers: [
    { matchPct: 100, ofPct: 3 },
    { matchPct: 50, ofPct: 2 },
  ],
  allowanceMonthly: 0,
  hsaMonthly: 85,
  otherMonthly: 0,
  ...over,
})
// Biweekly $95,000: gross 3,653.85 per paycheck; HSA 85 × 12 / 26 = 39.23
const job: Job = { id: 'j1', name: 'Example Co', payFrequency: 'biweekly', firstPayDate: null, entries: [entry()] }

const line = (kind: VerifyLine['kind'], tag: string, cents: number): VerifyLine => ({ kind, tag, cents })
const gross = 370385 // 3,653.85 + a $50 stipend
const payslip = {
  checkDate: '2026-10-31',
  grossCents: gross,
  lines: [
    line('earning', 'base', 365385),
    line('earning', 'allowance', 5000),
    line('pretax', 'trad_401k', Math.round(gross * 0.06)), // 6%: the job says 5%
    line('pretax', 'hsa', 3923),
    line('tax', 'federal', 70000),
    line('tax', 'state', 27782), // taxes total 26.4%
    line('employer', '401k_match', Math.round(gross * 0.04)),
  ],
}

const byWhat = (rows: NonNullable<ReturnType<typeof verifyAgainstJob>>) => Object.fromEntries(rows.map((r) => [r.what, r]))

describe('verifyAgainstJob', () => {
  const rows = byWhat(verifyAgainstJob(payslip, job)!)

  it('compares 401(k) rates as a share of gross and flags a difference', () => {
    expect(rows['401(k) traditional']).toMatchObject({ payslip: '6.0% of gross', job: '5.0%', status: 'differs' })
    expect(rows['401(k) Roth']).toMatchObject({ payslip: '0%', job: '0%', status: 'ok' })
  })

  it('checks the employer match against the tiers at what the payslip contributed', () => {
    // 6% contributed → 3% + 50% of 2% = 4%
    expect(rows['Employer match']).toMatchObject({ payslip: '$148.15 = 4.0%', job: '4.0% · 100% on first 3%, 50% on next 2%', status: 'ok' })
  })

  it('spreads the monthly HSA across paychecks', () => {
    expect(rows['HSA']).toMatchObject({ payslip: '$39.23', job: '$85/mo ≈ $39.23', status: 'ok' })
  })

  it('shows taxes as information only', () => {
    expect(rows['Taxes']).toMatchObject({ payslip: '26.4% of gross', job: '24% (estimate)', status: 'info' })
  })

  it('shows gross against the salary, as information when they differ', () => {
    expect(rows['Gross per paycheck']).toMatchObject({ payslip: '$3,703.85', job: '$3,653.85 from $95,000/yr', status: 'info' })
    const same = byWhat(verifyAgainstJob({ ...payslip, grossCents: 365385 }, job)!)
    expect(same['Gross per paycheck'].status).toBe('ok')
  })

  it('a flat match reads as one tier and no tiers as no match', () => {
    const flat = byWhat(verifyAgainstJob(payslip, { ...job, entries: [entry({ matchTiers: [{ matchPct: 100, ofPct: 6 }] })] })!)
    expect(flat['Employer match'].job).toBe('6.0% · 100% on first 6%')
    expect(flat['Employer match'].status).toBe('differs')
    const none = byWhat(verifyAgainstJob(payslip, { ...job, entries: [entry({ matchTiers: [] })] })!)
    expect(none['Employer match'].job).toBe('no match')
  })

  it('uses the pay entry in effect on the check date', () => {
    const raised = { ...job, entries: [entry(), entry({ date: '2026-11-01', kind: 'raise', tradPct: 6 })] }
    expect(byWhat(verifyAgainstJob(payslip, raised)!)['401(k) traditional'].status).toBe('differs')
    expect(byWhat(verifyAgainstJob({ ...payslip, checkDate: '2026-11-13' }, raised)!)['401(k) traditional'].status).toBe('ok')
  })

  it('gives nothing to compare without a pay entry on that date, or without gross', () => {
    expect(verifyAgainstJob(payslip, { ...job, entries: [] })).toBeNull()
    expect(verifyAgainstJob({ ...payslip, checkDate: '2025-12-31' }, job)).toBeNull()
    expect(verifyAgainstJob({ ...payslip, grossCents: 0 }, job)).toBeNull()
  })
})

describe('proposePayChange', () => {
  it('proposes the rates and HSA the payslip implies, from the pay period start, when they differ', () => {
    const p = { ...payslip, periodStart: '2026-10-16', periodEnd: '2026-10-31' }
    expect(proposePayChange(p, job)).toEqual({
      effectiveDate: '2026-10-16',
      tradPct: 6,
      rothPct: 0,
      hsaMonthly: 85,
      summary: '401(k) 6%',
    })
  })

  it('names every figure that changes', () => {
    const p = {
      ...payslip,
      periodStart: null,
      periodEnd: null,
      lines: [...payslip.lines.filter((l) => l.tag !== 'hsa'), line('posttax', 'roth_401k', Math.round(gross * 0.03)), line('pretax', 'hsa', 4800)], // 4,800 × 26 / 12 = $104/mo
    }
    expect(proposePayChange(p, job)).toMatchObject({ effectiveDate: '2026-10-31', tradPct: 6, rothPct: 3, hsaMonthly: 104, summary: '401(k) 6%, Roth 3%, HSA $104/mo' })
  })

  it('proposes nothing when the job already matches, or when there is no pay entry', () => {
    const same = { ...payslip, periodStart: null, periodEnd: null, lines: payslip.lines.map((l) => (l.tag === 'trad_401k' ? { ...l, cents: Math.round(gross * 0.05) } : l)) }
    expect(proposePayChange(same, job)).toBeNull()
    expect(proposePayChange({ ...payslip, periodStart: null }, { ...job, entries: [] })).toBeNull()
  })
})
