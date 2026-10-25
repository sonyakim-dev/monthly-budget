// One calendar year of Safe to spend: a cell per month plus the year's totals, from the same numbers Home shows.
import { addMonths, monthKeyOf, type MonthKey } from '@/lib/domain/dates'
import { buildMonth, type BudgetData } from './month'
import type { MonthRange } from './range'

export type MonthStatus = 'past' | 'now' | 'estimated' | 'none'

export type YearMonth = {
  month: MonthKey
  /** none: before the first month with data, or beyond the browsing range. */
  status: MonthStatus
  safeToSpendCents: number
  /** Share of the year's best month, −1..1 (negative when below zero); 0 for 'none'. */
  bar: number
}

export type YearView = {
  year: number
  months: YearMonth[]
  totalCents: number
  /** Months that already happened (before the current month). */
  soFarCents: number
  /** The current month and later, from the plan. */
  estimatedCents: number
  income: number
  bills: number
  savings: number
  expense: number
  /** First and last month of this year inside the data range, or null when the year has none. */
  monthsWithData: { from: MonthKey; to: MonthKey } | null
  prevYear: number | null
  nextYear: number | null
}

export function buildYear(data: BudgetData, year: number, today: string, range: MonthRange): YearView {
  const current = monthKeyOf(today)
  const keys = Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01`, i))
  const inRange = keys.filter((k) => k >= range.min && k <= range.max)
  const views = new Map(inRange.map((k) => [k, buildMonth(data, k, today)]))

  const sum = (pick: (v: ReturnType<typeof buildMonth>) => number) => [...views.values()].reduce((s, v) => s + pick(v), 0)
  const best = Math.max(0, ...[...views.values()].map((v) => v.safeToSpendCents))

  const months: YearMonth[] = keys.map((month) => {
    const v = views.get(month)
    if (!v) return { month, status: 'none', safeToSpendCents: 0, bar: 0 }
    const status: MonthStatus = month < current ? 'past' : month === current ? 'now' : 'estimated'
    return { month, status, safeToSpendCents: v.safeToSpendCents, bar: best ? v.safeToSpendCents / best : 0 }
  })

  return {
    year,
    months,
    totalCents: sum((v) => v.safeToSpendCents),
    soFarCents: [...views].filter(([k]) => k < current).reduce((s, [, v]) => s + v.safeToSpendCents, 0),
    estimatedCents: [...views].filter(([k]) => k >= current).reduce((s, [, v]) => s + v.safeToSpendCents, 0),
    income: sum((v) => v.income.totalCents),
    bills: sum((v) => v.bills.totalCents),
    savings: sum((v) => v.savings.totalCents),
    expense: sum((v) => v.expense.totalCents),
    monthsWithData: inRange.length ? { from: inRange[0], to: inRange[inRange.length - 1] } : null,
    prevYear: Number(range.min.slice(0, 4)) < year ? year - 1 : null,
    nextYear: Number(range.max.slice(0, 4)) > year ? year + 1 : null,
  }
}
