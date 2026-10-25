import { describe, expect, it } from 'vitest'
import { buildYear } from './year'
import type { BudgetData } from './month'

// One bill and one income plan; nothing else. Safe to spend = income − bills each month.
const data: BudgetData = {
  categories: [
    { id: 'unemp', name: 'Unemployment', kind: 'income', sort: 1 },
    { id: 'auto', name: 'Auto', kind: 'expense', sort: 1 },
  ],
  billGroups: [{ id: 'housing', name: 'Housing', color: '#f5d76e', sort: 1 }],
  bills: [{ id: 'rent', groupId: 'housing', name: 'Rent', sort: 1, versions: [{ month: '2025-11', amountCents: 100000 }] }],
  savingsPlans: [],
  incomeSources: [
    { id: 'edd', name: 'Unemployment', categoryId: 'unemp', frequency: 'monthly', startDate: '2025-11-15', endDate: null, versions: [{ date: '2025-11-15', amountCents: 150000 }] },
  ],
  jobs: [],
  payslips: [],
  transactions: [],
  limits: [],
}
const TODAY = '2026-03-10'
const RANGE = { min: '2025-11', max: '2027-03' }

describe('buildYear', () => {
  const y = buildYear(data, 2026, TODAY, RANGE)

  it('has a cell for every month, marked past, now, estimated or outside the data range', () => {
    expect(y.months.map((m) => m.status)).toEqual(['past', 'past', 'now', ...Array(9).fill('estimated')])
    expect(y.months[0]).toMatchObject({ month: '2026-01', safeToSpendCents: 50000 })
  })

  it('totals the year and splits what happened from what is estimated', () => {
    expect(y.totalCents).toBe(12 * 50000)
    expect(y.soFarCents).toBe(2 * 50000) // Jan, Feb
    expect(y.estimatedCents).toBe(10 * 50000) // Mar (now) onwards
    expect(y.income).toBe(12 * 150000)
    expect(y.bills).toBe(12 * 100000)
  })

  it('scales the bars by the best month, red below zero', () => {
    const lean = { ...data, transactions: [{ id: 't', date: '2026-02-05', kind: 'expense' as const, amountCents: 70000, name: 'Car', categoryId: 'auto', billId: null, savingsPlanId: null }] }
    const bars = buildYear(lean, 2026, TODAY, RANGE).months.map((m) => Math.round(m.bar * 100))
    expect(bars[0]).toBe(100) // Jan is the best month
    expect(bars[1]).toBe(-40) // Feb: −$200 of a $500 best
  })

  it('leaves months before the data range out of the total', () => {
    const y25 = buildYear(data, 2025, TODAY, RANGE)
    expect(y25.months.slice(0, 10).every((m) => m.status === 'none')).toBe(true)
    expect(y25.months[10].status).toBe('past')
    expect(y25.totalCents).toBe(2 * 50000)
    expect(y25.monthsWithData).toEqual({ from: '2025-11', to: '2025-12' })
  })

  it('knows which years can be browsed', () => {
    expect(y.prevYear).toBe(2025)
    expect(y.nextYear).toBe(2027)
    expect(buildYear(data, 2027, TODAY, RANGE).nextYear).toBeNull()
    expect(buildYear(data, 2025, TODAY, RANGE).prevYear).toBeNull()
  })
})
