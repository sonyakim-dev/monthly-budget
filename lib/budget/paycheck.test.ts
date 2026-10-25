import { describe, expect, it } from 'vitest'
import { estimatePaycheck, payDates, type Job, type PayEntry } from './paycheck'

const entry = (over: Partial<PayEntry>): PayEntry => ({
  date: '2026-09-14',
  kind: 'start',
  annualSalary: 120000,
  hourlyRate: null,
  hoursPerWeek: null,
  taxPct: 25,
  tradPct: 0,
  rothPct: 6,
  matchTiers: [{ matchPct: 100, ofPct: 6 }],
  allowanceMonthly: 0,
  hsaMonthly: 0,
  otherMonthly: 0,
  ...over,
})

describe('estimatePaycheck', () => {
  it('estimates take-home per paycheck from salary, tax and 401(k)', () => {
    const p = estimatePaycheck(entry({}), 'biweekly')
    expect(p.grossCents).toBe(461538) // 120,000 / 26
    expect(p.netCents).toBe(318461) // − 6% Roth 276.92 − 25% tax 1,153.85
    expect(p.employee401kCents).toBe(27692)
  })

  it('adds monthly allowance and spreads monthly HSA across paychecks', () => {
    const p = estimatePaycheck(entry({ annualSalary: 110000, allowanceMonthly: 50, taxPct: 24, tradPct: 8, rothPct: 4, hsaMonthly: 200 }), 'biweekly')
    expect(p.grossCents).toBe(425385) // (110,000 + 50 × 12) / 26
    // 4253.85 − (340.31 + 92.31) − 1020.92 − 170.15
    expect(p.netCents).toBe(263016)
  })

  it('matches 100% of the first 6% when the employee contributes at least that', () => {
    expect(estimatePaycheck(entry({}), 'biweekly').matchCents).toBe(27692) // 6% of 4,615.38
    expect(estimatePaycheck(entry({ rothPct: 10 }), 'biweekly').matchCents).toBe(27692) // capped at the tier
    expect(estimatePaycheck(entry({ rothPct: 2 }), 'biweekly').matchCents).toBe(9231) // only what was contributed
    expect(estimatePaycheck(entry({ rothPct: 0 }), 'biweekly').matchCents).toBe(0)
  })

  it('adds up tiers: 100% on the first 3%, then 50% on the next 2%', () => {
    const tiers = [
      { matchPct: 100, ofPct: 3 },
      { matchPct: 50, ofPct: 2 },
    ]
    const gross = 461538
    const at = (tradPct: number, rothPct: number) => estimatePaycheck(entry({ matchTiers: tiers, tradPct, rothPct }), 'biweekly').matchCents
    expect(at(10, 9)).toBe(Math.round(gross * 0.04)) // 3% + 1%
    expect(at(0, 4)).toBe(Math.round(gross * 0.035)) // 3% + half of 1%
    expect(at(2, 0)).toBe(Math.round(gross * 0.02))
  })

  it('no tiers means no match', () => {
    expect(estimatePaycheck(entry({ matchTiers: [] }), 'biweekly').matchCents).toBe(0)
  })

  it('supports hourly pay', () => {
    const p = estimatePaycheck(entry({ annualSalary: null, hourlyRate: 28, hoursPerWeek: 10, taxPct: 10, rothPct: 0 }), 'monthly')
    expect(p.grossCents).toBe(121333)
    expect(p.netCents).toBe(109200)
  })
})

describe('payDates', () => {
  const newJob: Job = { id: 'j2', name: 'Northwind', payFrequency: 'biweekly', firstPayDate: null, entries: [entry({})] }

  it('starts one pay period after the start date when no first payday is set', () => {
    expect(payDates(newJob, '2026-09-01', '2026-10-31').map((d) => d.date)).toEqual(['2026-09-28', '2026-10-12', '2026-10-26'])
  })

  it('stops at the end entry and pairs each date with the terms in effect', () => {
    const job: Job = {
      id: 'j1',
      name: 'Contoso',
      payFrequency: 'biweekly',
      firstPayDate: '2026-01-02',
      entries: [
        entry({ date: '2025-06-02', annualSalary: 100000 }),
        entry({ date: '2026-04-01', kind: 'raise', annualSalary: 104000 }),
        entry({ date: '2026-04-20', kind: 'end', annualSalary: null }),
      ],
    }
    const dates = payDates(job, '2026-03-20', '2026-05-31')
    expect(dates.map((d) => [d.date, d.entry.annualSalary])).toEqual([
      ['2026-03-27', 100000],
      ['2026-04-10', 104000],
    ])
  })
})
