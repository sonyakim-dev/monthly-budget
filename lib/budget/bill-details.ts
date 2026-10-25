import { addDays, addMonths, monthStart, type MonthKey } from '@/lib/domain/dates'
import type { BudgetData, IncomeSource, MonthVersion, Txn } from './month'
import { versionAt } from './schedule'

/** What a plan sheet needs to explain a change: the plan this month and around it, and any recorded payments. */
export type AmountDetails = {
  id: string
  name: string
  planCents: number
  prevCents: number
  /** The next month's amount as it is now: its own amount, or this month's carried on. */
  nextCents: number
  nextHasOwn: boolean
  payments: { id: string; date: string; cents: number }[]
}

export type BillDetails = AmountDetails & { groupId: string; dueDay: number | null }
export type SavingsDetails = AmountDetails & { day: number | null }
export type IncomeDetails = AmountDetails & { frequency: IncomeSource['frequency']; startDate: string; endDate: string | null; categoryId: string }

function amountDetails(plan: { id: string; name: string; versions: MonthVersion[] }, month: MonthKey, payments: Txn[]): AmountDetails {
  const next = addMonths(month, 1)
  const versions = plan.versions.map((v) => ({ from: v.month, value: v.amountCents }))
  const amountAt = (m: MonthKey) => versionAt(versions, m) ?? 0
  return {
    id: plan.id,
    name: plan.name,
    planCents: amountAt(month),
    prevCents: amountAt(addMonths(month, -1)),
    nextCents: amountAt(next),
    nextHasOwn: plan.versions.some((v) => v.month === next),
    payments: payments.filter((t) => t.date.startsWith(month)).map((t) => ({ id: t.id, date: t.date, cents: t.amountCents })),
  }
}

/**
 * A bill group for the sheets: its name, color and how many bills it has (stopped ones included),
 * and whether the Bills card shows it this month, with the bills it shows in their order.
 */
export type GroupDetails = { id: string; name: string; color: string; billCount: number; shown: boolean; shownBills: { id: string; name: string }[] }

export function groupDetails(
  data: Pick<BudgetData, 'billGroups' | 'bills'>,
  shownGroups: { id: string; lines: { billId: string; name: string }[] }[],
): GroupDetails[] {
  return [...data.billGroups]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .map((g) => {
      const shown = shownGroups.find((s) => s.id === g.id)
      return {
        id: g.id,
        name: g.name,
        color: g.color,
        billCount: data.bills.filter((b) => b.groupId === g.id).length,
        shown: Boolean(shown),
        shownBills: shown?.lines.map((l) => ({ id: l.billId, name: l.name })) ?? [],
      }
    })
}

export function billDetails(data: Pick<BudgetData, 'bills' | 'transactions'>, month: MonthKey): BillDetails[] {
  return data.bills.map((bill) => ({
    ...amountDetails(bill, month, data.transactions.filter((t) => t.kind === 'bill' && t.billId === bill.id)),
    groupId: bill.groupId,
    dueDay: bill.dueDay ?? null,
  }))
}

export function savingsDetails(data: Pick<BudgetData, 'savingsPlans' | 'transactions'>, month: MonthKey): SavingsDetails[] {
  return data.savingsPlans.map((plan) => ({
    ...amountDetails(plan, month, data.transactions.filter((t) => t.kind === 'saving' && t.savingsPlanId === plan.id)),
    day: plan.dayOfMonth ?? null,
  }))
}

/**
 * Other income: its amount per payment in the month and the months around it. Amounts start on a date, so a month's
 * amount is the one in effect on its last day; the next month's is what it starts with. Recorded income isn't edited here.
 */
export function incomeDetails(data: Pick<BudgetData, 'incomeSources'>, month: MonthKey): IncomeDetails[] {
  const next = addMonths(month, 1)
  const lastDay = (m: MonthKey) => addDays(monthStart(addMonths(m, 1)), -1)
  return data.incomeSources.map((source) => {
    const amountOn = (date: string) => versionAt(source.versions.map((v) => ({ from: v.date, value: v.amountCents })), date) ?? 0
    return {
      id: source.id,
      name: source.name,
      frequency: source.frequency,
      startDate: source.startDate,
      endDate: source.endDate,
      categoryId: source.categoryId,
      planCents: amountOn(lastDay(month)),
      prevCents: amountOn(lastDay(addMonths(month, -1))),
      nextCents: amountOn(monthStart(next)),
      nextHasOwn: source.versions.some((v) => v.date === monthStart(next)),
      payments: [],
    }
  })
}
