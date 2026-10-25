// Everything Home shows for one month, computed from plans and actual entries.
// Safe to spend = income (actual + expected) − bills − planned savings − expenses.
import { addDays, monthKeyOf, monthStart, type MonthKey } from "@/lib/domain/dates";
import { estimatePaycheck, payDates, type Job } from "./paycheck";
import { occurrences, versionAt, type Frequency } from "./schedule";

export type Txn = {
  id: string;
  date: string;
  kind: "income" | "expense" | "bill" | "saving";
  amountCents: number;
  name: string | null;
  categoryId: string | null;
  billId: string | null;
  savingsPlanId: string | null;
  /** The income source (other income) this entry is a payment of, if any. */
  incomeSourceId?: string | null;
  /** Where the entry came from; entries from a payslip are read-only. */
  source?: "manual" | "payslip" | "sheet-import";
};
export type Category = { id: string; name: string; kind: "income" | "expense"; sort: number };
export type BillGroup = { id: string; name: string; color: string; sort: number };
export type MonthVersion = { month: MonthKey; amountCents: number };
export type Bill = {
  id: string;
  groupId: string;
  name: string;
  dueDay?: number | null;
  sort: number;
  versions: MonthVersion[];
};
export type SavingsPlan = {
  id: string;
  name: string;
  dayOfMonth?: number | null;
  sort: number;
  versions: MonthVersion[];
};
export type IncomeSource = {
  id: string;
  name: string;
  categoryId: string;
  frequency: Frequency;
  startDate: string;
  endDate: string | null;
  versions: { date: string; amountCents: number }[];
};
/** Savings taken out of a paycheck, by payslip line tag. */
export type PaycheckSavingTag = "trad_401k" | "roth_401k" | "401k_match" | "hsa" | "hsa_match";
export type PayslipRef = {
  jobId: string;
  checkDate: string;
  employee401kCents: number;
  savings?: Partial<Record<PaycheckSavingTag, number>>;
};

const PAYCHECK_SAVINGS: { tag: PaycheckSavingTag; label: string }[] = [
  { tag: "trad_401k", label: "401(k) Traditional" },
  { tag: "roth_401k", label: "401(k) Roth" },
  { tag: "401k_match", label: "401(k) Employer match" },
  { tag: "hsa", label: "HSA" },
  { tag: "hsa_match", label: "HSA Employer match" },
];
export type Limit = { year: number; kind: "401k_employee" | "ira" | "hsa"; amountCents: number };

export type BudgetData = {
  categories: Category[];
  billGroups: BillGroup[];
  bills: Bill[];
  savingsPlans: SavingsPlan[];
  incomeSources: IncomeSource[];
  jobs: Job[];
  payslips: PayslipRef[];
  /** Paydays estimated from a job that didn't happen; they leave Income and paycheck savings. */
  skippedPaydays?: { jobId: string; date: string }[];
  /** Single payments of other income that aren't coming; they leave Income but stay listed so they can be put back. */
  skippedIncome?: { sourceId: string; date: string }[];
  transactions: Txn[];
  limits: Limit[];
};

/** source: a recorded entry, a paycheck estimated from a job, or other planned income (sourceId says which). */
export type IncomeLine = {
  id: string | null;
  source: "entry" | "job" | "plan";
  /** The plan (other income) or the job this line comes from. */
  sourceId: string | null;
  date: string;
  name: string;
  cents: number;
  /** Still to come. */
  expected: boolean;
  /** A paycheck estimated from the job because no payslip was uploaded for it (past or future). */
  estimated: boolean;
  /** An estimated payday marked as not happening; shown muted so it can be unskipped, not counted. */
  skipped?: boolean;
};
export type PlanLine = { name: string; cents: number; actual: boolean; entryIds: string[] };
export type BillLine = PlanLine & { billId: string };
export type SavingsLine = PlanLine & { planId: string | null };

export type MonthView = {
  month: MonthKey;
  status: "past" | "current" | "future";
  daysLeft: number | null;
  safeToSpendCents: number;
  perDay: { cents: number; until: "payday" | "month-end"; days: number } | null;
  income: { totalCents: number; lines: IncomeLine[] };
  savings: {
    /** Cash transfers plus paycheck savings. Safe to spend subtracts only the cash transfers. */
    totalCents: number;
    lines: SavingsLine[];
    /** Taken out of paychecks (payslips and estimates). Shown, not subtracted: it's already out of take-home. */
    paycheck: { totalCents: number; lines: { tag: PaycheckSavingTag; label: string; cents: number }[] };
    k401: { ytdCents: number; limitCents: number | null } | null;
  };
  bills: {
    totalCents: number;
    groups: { id: string; name: string; color: string; totalCents: number; lines: BillLine[] }[];
  };
  expense: {
    totalCents: number;
    categories: {
      categoryId: string;
      name: string;
      cents: number;
      entries: { id: string; date: string; name: string; cents: number }[];
    }[];
  };
};

// An estimate is dropped when a payslip (paychecks) or an actual entry (other income) is this close.
// Under half a week, so a weekly job's payslip can only match its own payday.
const PAYSLIP_WINDOW_DAYS = 3;
const INCOME_MATCH_DAYS = 3;

const sum = (xs: { cents: number }[]) => xs.reduce((s, x) => s + x.cents, 0);
const within = (a: string, b: string, days: number) => a >= addDays(b, -days) && a <= addDays(b, days);
const bySort = <T extends { sort: number; name: string }>(a: T, b: T) =>
  a.sort - b.sort || a.name.localeCompare(b.name);

function monthEnd(month: MonthKey) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function planLines<P extends { id: string; name: string; sort: number; versions: MonthVersion[] }>(
  plans: P[],
  month: MonthKey,
  actual: (plan: P) => Txn[],
) {
  return [...plans].sort(bySort).flatMap((plan) => {
    const paid = actual(plan);
    if (paid.length) {
      return [
        {
          plan,
          name: plan.name,
          cents: paid.reduce((s, t) => s + t.amountCents, 0),
          actual: true,
          entryIds: paid.map((t) => t.id),
        },
      ];
    }
    const planned = versionAt(
      plan.versions.map((v) => ({ from: v.month, value: v.amountCents })),
      month,
    );
    return planned ? [{ plan, name: plan.name, cents: planned, actual: false, entryIds: [] as string[] }] : [];
  });
}

export function buildMonth(data: BudgetData, month: MonthKey, today: string): MonthView {
  const from = monthStart(month);
  const to = monthEnd(month);
  const inMonth = data.transactions.filter((t) => t.date >= from && t.date <= to);
  const categoryName = (id: string | null) => data.categories.find((c) => c.id === id)?.name ?? "Other";

  // Income: actual entries, future paychecks without a payslip, and expected income sources.
  const actualIncome: IncomeLine[] = inMonth
    .filter((t) => t.kind === "income")
    .map((t) => ({
      id: t.id,
      source: "entry",
      sourceId: null,
      date: t.date,
      name: t.name ?? categoryName(t.categoryId),
      cents: t.amountCents,
      expected: false,
      estimated: false,
    }));
  const estimates = data.jobs.flatMap((job) =>
    payDates(job, from, to)
      // A payday with no payslip keeps its estimate, past or future: not every payslip gets uploaded.
      .filter(
        ({ date }) => !data.payslips.some((p) => p.jobId === job.id && within(p.checkDate, date, PAYSLIP_WINDOW_DAYS)),
      )
      .map(({ date, entry }) => ({
        date,
        jobId: job.id,
        skipped: data.skippedPaydays?.some((s) => s.jobId === job.id && s.date === date) ?? false,
        name: `Wage (${job.name})`,
        estimate: estimatePaycheck(entry, job.payFrequency),
      })),
  );
  const paychecks: IncomeLine[] = estimates.map((e) => ({
    id: null,
    source: "job",
    sourceId: e.jobId,
    skipped: e.skipped,
    date: e.date,
    name: e.name,
    cents: e.estimate.netCents,
    expected: e.date > today,
    estimated: true,
  }));
  const sources: IncomeLine[] = data.incomeSources.flatMap((s) =>
    occurrences({ frequency: s.frequency, start: s.startDate, end: s.endDate }, from, to)
      // A payment linked to this source replaces the occurrence nearest to it.
      .filter((date) => !data.transactions.some((t) => t.incomeSourceId === s.id && within(t.date, date, INCOME_MATCH_DAYS)))
      .flatMap((date) => {
        const cents = versionAt(
          s.versions.map((v) => ({ from: v.date, value: v.amountCents })),
          date,
        );
        // Once its pay date arrives, other income counts as received without being confirmed.
        const skipped = data.skippedIncome?.some((k) => k.sourceId === s.id && k.date === date) ?? false;
        return cents
          ? [{ id: null, source: "plan" as const, sourceId: s.id, estimated: false, date, name: s.name, cents, expected: date > today, skipped }]
          : [];
      }),
  );
  const incomeLines = [...actualIncome, ...paychecks, ...sources].sort(
    (a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
  );

  // Bills: amount in effect for the month, or the real payment when recorded.
  const billLines = planLines(data.bills, month, (b) => inMonth.filter((t) => t.kind === "bill" && t.billId === b.id));
  const groups = [...data.billGroups]
    .sort(bySort)
    .map((g) => {
      const lines: BillLine[] = billLines
        .filter((l) => l.plan.groupId === g.id)
        .map(({ plan, name, cents, actual, entryIds }) => ({ billId: plan.id, name, cents, actual, entryIds }));
      return { id: g.id, name: g.name, color: g.color, totalCents: sum(lines), lines };
    })
    // A group with no bills at all still shows, so it can be renamed or deleted.
    .filter((g) => g.lines.length > 0 || !data.bills.some((b) => b.groupId === g.id));

  // Savings: planned amount for the month or the real transfer, plus transfers not tied to a plan.
  const savingsLines: SavingsLine[] = [
    ...planLines(data.savingsPlans, month, (p) =>
      inMonth.filter((t) => t.kind === "saving" && t.savingsPlanId === p.id),
    ).map(({ plan, name, cents, actual, entryIds }) => ({ planId: plan.id, name, cents, actual, entryIds })),
    ...inMonth
      .filter((t) => t.kind === "saving" && t.savingsPlanId === null)
      .map((t) => ({
        planId: null,
        name: t.name ?? "Savings transfer",
        cents: t.amountCents,
        actual: true,
        entryIds: [t.id],
      })),
  ];
  const year = Number(month.slice(0, 4));
  const ytd401k = data.payslips
    .filter((p) => p.checkDate >= `${year}-01-01` && p.checkDate <= to)
    .reduce((s, p) => s + p.employee401kCents, 0);
  const limit401k = data.limits.find((l) => l.year === year && l.kind === "401k_employee")?.amountCents ?? null;

  // Paycheck savings this month: actual payslip lines plus estimates for future paydays.
  const paycheckByTag = new Map<PaycheckSavingTag, number>();
  const addSaving = (tag: PaycheckSavingTag, cents: number) =>
    paycheckByTag.set(tag, (paycheckByTag.get(tag) ?? 0) + cents);
  for (const p of data.payslips.filter((p) => p.checkDate >= from && p.checkDate <= to)) {
    for (const { tag } of PAYCHECK_SAVINGS) addSaving(tag, p.savings?.[tag] ?? 0);
  }
  for (const { estimate } of estimates.filter((e) => !e.skipped)) {
    addSaving("trad_401k", estimate.tradCents);
    addSaving("roth_401k", estimate.rothCents);
    addSaving("401k_match", estimate.matchCents);
    addSaving("hsa", estimate.hsaCents);
  }
  const paycheckLines = PAYCHECK_SAVINGS.map(({ tag, label }) => ({
    tag,
    label,
    cents: paycheckByTag.get(tag) ?? 0,
  })).filter((l) => l.cents > 0);

  // Expenses by category, in the categories' own order (the same one they are picked from).
  const categorySort = (id: string) => data.categories.find((c) => c.id === id)?.sort ?? Number.MAX_SAFE_INTEGER;
  const byCategory = new Map<string, Txn[]>();
  for (const t of inMonth.filter((t) => t.kind === "expense" && t.categoryId)) {
    byCategory.set(t.categoryId!, [...(byCategory.get(t.categoryId!) ?? []), t]);
  }
  const expenseCategories = [...byCategory]
    .map(([categoryId, txns]) => ({
      categoryId,
      name: categoryName(categoryId),
      cents: txns.reduce((s, t) => s + t.amountCents, 0),
      entries: [...txns]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((t) => ({ id: t.id, date: t.date, name: t.name ?? categoryName(categoryId), cents: t.amountCents })),
    }))
    .sort((a, b) => categorySort(a.categoryId) - categorySort(b.categoryId) || a.name.localeCompare(b.name));

  const income = sum(incomeLines.filter((l) => !l.skipped));
  const bills = sum(groups.map((g) => ({ cents: g.totalCents })));
  const savings = sum(savingsLines);
  const paycheckSavings = sum(paycheckLines);
  const expenses = sum(expenseCategories);
  const safeToSpendCents = income - bills - savings - expenses;

  const currentMonth = monthKeyOf(today);
  const status = month < currentMonth ? "past" : month > currentMonth ? "future" : "current";
  let daysLeft: number | null = null;
  let perDay: MonthView["perDay"] = null;
  if (status === "current") {
    daysLeft = Number(to.slice(8)) - Number(today.slice(8));
    // The soonest payday of any job that isn't skipped, with or without a payslip already uploaded.
    const nextPayday = data.jobs
      .flatMap((job) =>
        payDates(job, from, to)
          .map(({ date }) => date)
          .filter((date) => !data.skippedPaydays?.some((s) => s.jobId === job.id && s.date === date)),
      )
      .filter((d) => d > today)
      .sort()[0];
    const days = nextPayday ? Number(nextPayday.slice(8)) - Number(today.slice(8)) : daysLeft + 1;
    perDay = { cents: Math.round(safeToSpendCents / days), until: nextPayday ? "payday" : "month-end", days };
  }

  return {
    month,
    status,
    daysLeft,
    safeToSpendCents,
    perDay,
    income: { totalCents: income, lines: incomeLines },
    savings: {
      totalCents: savings + paycheckSavings,
      lines: savingsLines,
      paycheck: { totalCents: paycheckSavings, lines: paycheckLines },
      k401: ytd401k > 0 || limit401k !== null ? { ytdCents: ytd401k, limitCents: limit401k } : null,
    },
    bills: { totalCents: bills, groups },
    expense: { totalCents: expenses, categories: expenseCategories },
  };
}
