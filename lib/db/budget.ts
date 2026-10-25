import type { BudgetData, PaycheckSavingTag, Txn } from '@/lib/budget/month'
import type { Job, MatchTier, PayEntry, PayFrequency } from '@/lib/budget/paycheck'
import type { Frequency } from '@/lib/budget/schedule'
import { toCents } from '@/lib/domain/money'
import type { Db } from '@/lib/supabase/types'

const monthKey = (date: string) => date.slice(0, 7)

/** `match_tiers` is JSON checked by the database (valid_match_tiers), so only the field names need mapping. */
function matchTiers(json: unknown): MatchTier[] {
  return (json as { match_pct: number; of_pct: number }[]).map((t) => ({ matchPct: t.match_pct, ofPct: t.of_pct }))
}
const SAVING_TAGS = new Set<string>(['trad_401k', 'roth_401k', '401k_match', 'hsa', 'hsa_match'])

function unwrap<T>(result: { data: T | null; error: unknown }, what: string): T {
  if (result.error) throw new Error(`Could not load ${what}`, { cause: result.error })
  return result.data as T
}

/** The API returns at most this many rows per request (max_rows in supabase/config.toml and the hosted default). */
const PAGE = 1000

/** Every row of a query that may exceed one page, fetched a page at a time. The query must be deterministically ordered. */
async function allRows<T>(query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }> }, what: string): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const page = unwrap(await query.range(from, from + PAGE - 1), what)
    rows.push(...page)
    if (page.length < PAGE) return rows
  }
}

/** Every job with its pay entries, by name. */
export async function loadJobs(supabase: Db): Promise<Job[]> {
  const rows = unwrap(
    await supabase
      .from('jobs')
      .select(
        'id, name, pay_frequency, first_pay_date, job_pay_entries ( effective_date, kind, annual_salary, hourly_rate, hours_per_week, est_tax_pct, trad_401k_pct, roth_401k_pct, match_tiers, allowance_monthly, hsa_monthly, other_deductions_monthly )',
      )
      .order('name'),
    'jobs',
  )
  return rows.map((j) => ({
    id: j.id,
    name: j.name,
    payFrequency: j.pay_frequency as PayFrequency,
    firstPayDate: j.first_pay_date,
    entries: j.job_pay_entries.map(
      (e): PayEntry => ({
        date: e.effective_date,
        kind: e.kind as PayEntry['kind'],
        annualSalary: e.annual_salary,
        hourlyRate: e.hourly_rate,
        hoursPerWeek: e.hours_per_week,
        taxPct: e.est_tax_pct,
        tradPct: e.trad_401k_pct,
        rothPct: e.roth_401k_pct,
        matchTiers: matchTiers(e.match_tiers),
        allowanceMonthly: e.allowance_monthly,
        hsaMonthly: e.hsa_monthly,
        otherMonthly: e.other_deductions_monthly,
      }),
    ),
  }))
}

/** Everything the month view needs. Transactions are limited to [from, to] (ISO dates). */
export async function loadBudgetData(supabase: Db, from: string, to: string): Promise<BudgetData> {
  const [categories, billGroups, bills, savingsPlans, incomeSources, jobs, payslips, skipped, skippedIncome, transactions, limits] = await Promise.all([
    supabase.from('categories').select('id, name, kind, sort').order('kind').order('sort').order('name'),
    supabase.from('bill_groups').select('id, name, color, sort'),
    supabase.from('bills').select('id, group_id, name, due_day, sort, bill_versions ( effective_month, amount )'),
    supabase.from('savings_plans').select('id, name, day_of_month, sort, savings_plan_versions ( effective_month, amount )'),
    supabase.from('income_sources').select('id, name, category_id, frequency, start_date, end_date, income_source_versions ( effective_date, amount )'),
    loadJobs(supabase),
    supabase.from('payslips').select('job_id, check_date, payslip_lines ( tag, amount )'),
    supabase.from('skipped_paydays').select('job_id, pay_date').gte('pay_date', from).lte('pay_date', to),
    supabase.from('skipped_income').select('source_id, pay_date').gte('pay_date', from).lte('pay_date', to),
    allRows(
      supabase
        .from('transactions')
        .select('id, date, kind, amount, name, category_id, bill_id, savings_plan_id, income_source_id, source')
        .gte('date', from)
        .lte('date', to)
        .order('date')
        .order('id'),
      'transactions',
    ),
    supabase.from('contribution_limits').select('year, kind, amount'),
  ])

  return {
    categories: unwrap(categories, 'categories').map((c) => ({ id: c.id, name: c.name, kind: c.kind as 'income' | 'expense', sort: c.sort })),
    billGroups: unwrap(billGroups, 'bill groups'),
    bills: unwrap(bills, 'bills').map((b) => ({
      id: b.id,
      groupId: b.group_id,
      name: b.name,
      dueDay: b.due_day,
      sort: b.sort,
      versions: b.bill_versions.map((v) => ({ month: monthKey(v.effective_month), amountCents: toCents(v.amount) })),
    })),
    savingsPlans: unwrap(savingsPlans, 'savings plans').map((p) => ({
      id: p.id,
      name: p.name,
      dayOfMonth: p.day_of_month,
      sort: p.sort,
      versions: p.savings_plan_versions.map((v) => ({ month: monthKey(v.effective_month), amountCents: toCents(v.amount) })),
    })),
    incomeSources: unwrap(incomeSources, 'income sources').map((s) => ({
      id: s.id,
      name: s.name,
      categoryId: s.category_id,
      frequency: s.frequency as Frequency,
      startDate: s.start_date,
      endDate: s.end_date,
      versions: s.income_source_versions.map((v) => ({ date: v.effective_date, amountCents: toCents(v.amount) })),
    })),
    jobs,
    payslips: unwrap(payslips, 'payslips').map((p) => {
      const savings: Partial<Record<PaycheckSavingTag, number>> = {}
      for (const l of p.payslip_lines) {
        if (SAVING_TAGS.has(l.tag)) savings[l.tag as PaycheckSavingTag] = (savings[l.tag as PaycheckSavingTag] ?? 0) + toCents(l.amount)
      }
      return {
        jobId: p.job_id,
        checkDate: p.check_date,
        employee401kCents: (savings.trad_401k ?? 0) + (savings.roth_401k ?? 0),
        savings,
      }
    }),
    transactions: transactions.map(
      (t): Txn => ({
        id: t.id,
        date: t.date,
        kind: t.kind as Txn['kind'],
        amountCents: toCents(t.amount),
        name: t.name,
        categoryId: t.category_id,
        billId: t.bill_id,
        savingsPlanId: t.savings_plan_id,
        incomeSourceId: t.income_source_id,
        source: t.source as Txn['source'],
      }),
    ),
    skippedPaydays: unwrap(skipped, 'skipped paydays').map((s) => ({ jobId: s.job_id, date: s.pay_date })),
    skippedIncome: unwrap(skippedIncome, 'skipped income').map((s) => ({ sourceId: s.source_id, date: s.pay_date })),
    limits: unwrap(limits, 'limits').map((l) => ({ year: l.year, kind: l.kind as BudgetData['limits'][number]['kind'], amountCents: toCents(l.amount) })),
  }
}
