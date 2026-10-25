import { describe, expect, it } from "vitest";
import { buildMonth, type BudgetData } from "./month";
import type { PayEntry } from "./paycheck";

const pay = (over: Partial<PayEntry>): PayEntry => ({
  date: "2026-01-01",
  kind: "start",
  annualSalary: 52000,
  hourlyRate: null,
  hoursPerWeek: null,
  taxPct: 0,
  tradPct: 0,
  rothPct: 0,
  matchTiers: [],
  allowanceMonthly: 0,
  hsaMonthly: 0,
  otherMonthly: 0,
  ...over,
});

const data: BudgetData = {
  categories: [
    { id: "salary", name: "Salary", kind: "income", sort: 1 },
    { id: "unemp", name: "Unemployment", kind: "income", sort: 2 },
    { id: "dining", name: "Dining", kind: "expense", sort: 2 },
    { id: "groc", name: "Groceries", kind: "expense", sort: 1 },
  ],
  billGroups: [{ id: "housing", name: "Housing", color: "#f5d76e", sort: 1 }],
  bills: [
    {
      id: "rent",
      groupId: "housing",
      name: "Rent",
      sort: 1,
      versions: [
        { month: "2026-01", amountCents: 125000 },
        { month: "2026-11", amountCents: 248050 },
      ],
    },
    {
      id: "wifi",
      groupId: "housing",
      name: "Wifi",
      sort: 2,
      versions: [
        { month: "2026-01", amountCents: 3041 },
        { month: "2026-11", amountCents: 1000 },
        { month: "2026-12", amountCents: 0 },
      ],
    },
  ],
  savingsPlans: [
    {
      id: "hysa",
      name: "HYSA",
      sort: 1,
      versions: [
        { month: "2026-01", amountCents: 50000 },
        { month: "2026-10", amountCents: 0 },
      ],
    },
  ],
  incomeSources: [
    {
      id: "edd",
      name: "Unemployment",
      categoryId: "unemp",
      frequency: "weekly",
      startDate: "2026-10-03",
      endDate: "2026-10-30",
      versions: [{ date: "2026-10-03", amountCents: 40000 }],
    },
  ],
  jobs: [
    // pays Oct 2, 16, 30 — $2,000 each
    {
      id: "fab",
      name: "Fabrikam",
      payFrequency: "biweekly",
      firstPayDate: "2026-10-02",
      entries: [pay({ tradPct: 5, matchTiers: [{ matchPct: 100, ofPct: 3 }] })],
    },
    // starts Oct 26 — first payday Nov 9
    {
      id: "nw",
      name: "Northwind",
      payFrequency: "biweekly",
      firstPayDate: null,
      entries: [pay({ date: "2026-10-26", annualSalary: 140000, taxPct: 28, rothPct: 6 })],
    },
  ],
  payslips: [
    { jobId: "fab", checkDate: "2026-03-13", employee401kCents: 50000, savings: { trad_401k: 50000 } },
    {
      jobId: "fab",
      checkDate: "2026-10-30",
      employee401kCents: 10000,
      savings: { trad_401k: 10000, "401k_match": 4000, hsa: 2500, hsa_match: 1000 },
    }, // uploaded early
  ],
  transactions: [
    {
      id: "t1",
      date: "2026-10-03",
      kind: "income",
      amountCents: 45000,
      name: "Unemployment",
      categoryId: "unemp",
      billId: null,
      savingsPlanId: null,
      incomeSourceId: "edd",
    },
    {
      id: "t2",
      date: "2026-10-30",
      kind: "income",
      amountCents: 190000,
      name: "Fabrikam pay",
      categoryId: "salary",
      billId: null,
      savingsPlanId: null,
    },
    {
      id: "t3",
      date: "2026-10-07",
      kind: "expense",
      amountCents: 2257,
      name: "Ramen",
      categoryId: "dining",
      billId: null,
      savingsPlanId: null,
    },
    {
      id: "t4",
      date: "2026-10-11",
      kind: "expense",
      amountCents: 7370,
      name: "Sushi",
      categoryId: "dining",
      billId: null,
      savingsPlanId: null,
    },
    {
      id: "t5",
      date: "2026-10-09",
      kind: "expense",
      amountCents: 6410,
      name: "Market",
      categoryId: "groc",
      billId: null,
      savingsPlanId: null,
    },
    {
      id: "t6",
      date: "2026-10-15",
      kind: "bill",
      amountCents: 3100,
      name: "Wifi",
      categoryId: null,
      billId: "wifi",
      savingsPlanId: null,
    },
    {
      id: "t7",
      date: "2026-09-12",
      kind: "expense",
      amountCents: 1000,
      name: "Drinks",
      categoryId: "dining",
      billId: null,
      savingsPlanId: null,
    },
  ],
  limits: [{ year: 2026, kind: "401k_employee", amountCents: 2450000 }],
};

const TODAY = "2026-10-14";

describe("buildMonth · current month", () => {
  const m = buildMonth(data, "2026-10", TODAY);

  it("lists actual income and expected income; a past payday without a payslip keeps its estimate as received", () => {
    expect(m.income.lines.map((l) => [l.date, l.name, l.cents, l.expected])).toEqual([
      ["2026-10-02", "Wage (Fabrikam)", 190000, false], // no payslip uploaded: the estimate counts as received
      ["2026-10-03", "Unemployment", 45000, false],
      ["2026-10-10", "Unemployment", 40000, false], // its date has passed, so it counts as received
      ["2026-10-16", "Wage (Fabrikam)", 190000, true],
      ["2026-10-17", "Unemployment", 40000, true],
      ["2026-10-24", "Unemployment", 40000, true],
      ["2026-10-30", "Fabrikam pay", 190000, false],
    ]);
    expect(m.income.totalCents).toBe(735000);
  });

  it("does not count a skipped payday, nor its paycheck savings", () => {
    const skipped = { ...data, skippedPaydays: [{ jobId: "fab", date: "2026-10-02" }] };
    const s = buildMonth(skipped, "2026-10", TODAY);
    expect(s.income.lines.find((l) => l.date === "2026-10-02")!.skipped).toBe(true); // still listed, muted, so it can be unskipped
    expect(s.income.totalCents).toBe(545000);
    expect(s.savings.paycheck.totalCents).toBe(33500);
  });

  it("marks a past paycheck estimate so Home can say it is estimated", () => {
    const oct2 = m.income.lines.find((l) => l.date === "2026-10-02")!;
    expect([oct2.source, oct2.estimated]).toEqual(["job", true]);
    expect(m.income.lines.find((l) => l.date === "2026-10-30")!.estimated).toBe(false);
  });

  it("says which plan other income comes from", () => {
    expect(m.income.lines.map((l) => [l.date, l.source, l.sourceId])).toContainEqual(["2026-10-10", "plan", "edd"]);
    expect(m.income.lines.filter((l) => l.source === "entry").every((l) => l.sourceId === null)).toBe(true);
    expect(m.income.lines.find((l) => l.source === "job")!.sourceId).toBe("fab");
  });

  it("a payment hides only the occurrence of the source it is linked to, not another source in the same category", () => {
    const gig = { ...data.incomeSources[0], id: "gig", name: "Side gig", versions: [{ date: "2026-10-03", amountCents: 10000 }] };
    const paid = (sourceId: string | null) => ({
      ...data.transactions[0],
      id: "p",
      date: "2026-10-03",
      amountCents: 10000,
      incomeSourceId: sourceId,
    });
    const monthly = (txn: ReturnType<typeof paid>) =>
      buildMonth({ ...data, incomeSources: [gig], transactions: [txn] }, "2026-10", TODAY).income.lines.filter((l) => l.date === "2026-10-03");
    expect(monthly(paid("gig")).map((l) => [l.source, l.cents])).toEqual([["entry", 10000]]);
    // Same category and date, but not this source's payment: the planned occurrence stays.
    expect(monthly(paid(null)).map((l) => [l.source, l.cents])).toEqual(
      expect.arrayContaining([
        ["entry", 10000],
        ["plan", 10000],
      ]),
    );
    expect(monthly(paid(null))).toHaveLength(2);
  });

  it("a skipped payment of other income stays listed, muted, and is not counted", () => {
    const s = buildMonth({ ...data, skippedIncome: [{ sourceId: "edd", date: "2026-10-17" }] }, "2026-10", TODAY);
    const line = s.income.lines.find((l) => l.source === "plan" && l.date === "2026-10-17")!;
    expect(line.skipped).toBe(true);
    expect(s.income.totalCents).toBe(735000 - 40000);
    expect(s.income.lines.find((l) => l.date === "2026-10-24")!.skipped).toBeFalsy(); // only that payment
  });

  it("counts other income as received on its pay date", () => {
    const onPayday = buildMonth(data, "2026-10", "2026-10-17");
    expect(onPayday.income.lines.filter((l) => l.name === "Unemployment").map((l) => [l.date, l.expected])).toEqual([
      ["2026-10-03", false],
      ["2026-10-10", false],
      ["2026-10-17", false],
      ["2026-10-24", true],
    ]);
  });

  it("uses the bill amount in effect, replaced by a real payment when there is one", () => {
    expect(m.bills.groups).toEqual([
      {
        id: "housing",
        name: "Housing",
        color: "#f5d76e",
        totalCents: 128100,
        lines: [
          { billId: "rent", name: "Rent", cents: 125000, actual: false, entryIds: [] },
          { billId: "wifi", name: "Wifi", cents: 3100, actual: true, entryIds: ["t6"] },
        ],
      },
    ]);
    expect(m.bills.totalCents).toBe(128100);
  });

  it("drops a savings plan that is stopped from this month", () => {
    expect(m.savings.lines).toEqual([]);
    expect(m.savings.totalCents).toBe(m.savings.paycheck.totalCents);
  });

  it("shows savings taken out of paychecks: payslips plus estimates, counted in the total but not subtracted from safe to spend", () => {
    expect(m.savings.paycheck).toEqual({
      // Oct 30 payslip + estimates for Oct 2 (no payslip) and Oct 16: 401(k) 10,000 each, match 4,000 + 6,000 + 6,000
      totalCents: 10000 + 10000 + 10000 + 4000 + 6000 + 6000 + 2500 + 1000,
      lines: [
        { tag: "trad_401k", label: "401(k) Traditional", cents: 30000 },
        { tag: "401k_match", label: "401(k) Employer match", cents: 16000 },
        { tag: "hsa", label: "HSA", cents: 2500 },
        { tag: "hsa_match", label: "HSA Employer match", cents: 1000 },
      ],
    });
    expect(m.savings.totalCents).toBe(49500);
    expect(m.safeToSpendCents).toBe(m.income.totalCents - m.bills.totalCents - m.expense.totalCents); // already out of take-home
  });

  it("reports 401(k) year to date against the limit", () => {
    expect(m.savings.k401).toEqual({ ytdCents: 60000, limitCents: 2450000 });
  });

  it("groups expenses by category in the categories' order (not by amount), entries newest first", () => {
    expect(m.expense.categories.map((c) => [c.name, c.cents, c.entries.map((e) => e.id)])).toEqual([
      ["Groceries", 6410, ["t5"]], // sort 1, though Dining spent more
      ["Dining", 9627, ["t4", "t3"]],
    ]);
    expect(m.expense.totalCents).toBe(16037);
  });

  it("computes safe to spend and the daily amount until the next payday", () => {
    expect(m.safeToSpendCents).toBe(735000 - 128100 - 0 - 16037);
    expect(m.perDay).toEqual({ cents: Math.round(590863 / 2), until: "payday", days: 2 });
    expect(m.status).toBe("current");
    expect(m.daysLeft).toBe(17);
  });

  it("the daily amount runs to the soonest payday across jobs, whatever order the jobs come in", () => {
    const later = { id: "late", name: "Later", payFrequency: "monthly" as const, firstPayDate: "2026-10-28", entries: [pay({})] };
    const m2 = buildMonth({ ...data, jobs: [later, ...data.jobs] }, "2026-10", TODAY);
    expect(m2.perDay?.days).toBe(2);
  });

  it("a payslip replaces only its own payday, so a weekly job keeps the estimates a week either side", () => {
    const weekly = { id: "wk", name: "Weekly", payFrequency: "weekly" as const, firstPayDate: "2026-10-02", entries: [pay({})] };
    const m2 = buildMonth(
      { ...data, jobs: [weekly], payslips: [{ jobId: "wk", checkDate: "2026-10-16", employee401kCents: 0 }] },
      "2026-10",
      TODAY,
    );
    expect(m2.income.lines.filter((l) => l.source === "job").map((l) => l.date)).toEqual([
      "2026-10-02",
      "2026-10-09",
      "2026-10-23",
      "2026-10-30",
    ]);
  });

  it("a skipped payday is not the next payday; the one after it is (here Oct 30, whose payslip came early)", () => {
    const m2 = buildMonth({ ...data, skippedPaydays: [{ jobId: "fab", date: "2026-10-16" }] }, "2026-10", TODAY);
    expect(m2.perDay).toMatchObject({ until: "payday", days: 16 });
  });
});

describe("buildMonth · other months", () => {
  it("a past month uses its own plan versions and has no daily amount", () => {
    const m = buildMonth(data, "2026-09", TODAY);
    expect(m.status).toBe("past");
    expect(m.savings.lines).toEqual([{ planId: "hysa", name: "HYSA", cents: 50000, actual: false, entryIds: [] }]);
    expect(m.perDay).toBeNull();
    expect(m.daysLeft).toBeNull();
  });

  it("a future month uses the new versions and estimated paychecks", () => {
    const m = buildMonth(data, "2026-11", TODAY);
    expect(m.status).toBe("future");
    expect(m.bills.groups[0].lines.map((l) => [l.name, l.cents])).toEqual([
      ["Rent", 248050],
      ["Wifi", 1000],
    ]);
    expect(m.income.lines.filter((l) => l.name === "Wage (Northwind)").map((l) => [l.date, l.cents])).toEqual([
      ["2026-11-09", 355385],
      ["2026-11-23", 355385],
    ]);
  });

  it("a stopped bill disappears", () => {
    const m = buildMonth(data, "2026-12", TODAY);
    expect(m.bills.groups[0].lines.map((l) => l.name)).toEqual(["Rent"]);
  });

  it("shows a group with no bills at all, but hides one whose bills are all stopped", () => {
    const more: BudgetData = {
      ...data,
      billGroups: [
        ...data.billGroups,
        { id: "auto", name: "Auto", color: "#9ccc9c", sort: 2 },
        { id: "old", name: "Old", color: "#c8c8c0", sort: 3 },
      ],
      bills: [
        ...data.bills,
        {
          id: "gym",
          groupId: "old",
          name: "Gym",
          sort: 1,
          versions: [
            { month: "2026-01", amountCents: 3000 },
            { month: "2026-06", amountCents: 0 },
          ],
        },
      ],
    };
    const m = buildMonth(more, "2026-10", TODAY);
    expect(m.bills.groups.map((g) => [g.name, g.totalCents, g.lines.length])).toEqual([
      ["Housing", 128100, 2],
      ["Auto", 0, 0],
    ]);
  });

  it("a safe-to-spend below zero stays negative", () => {
    const lean = {
      ...data,
      jobs: [],
      incomeSources: [],
      transactions: data.transactions.filter((t) => t.kind !== "income"),
    };
    expect(buildMonth(lean, "2026-10", TODAY).safeToSpendCents).toBe(-(128100 + 16037));
  });
});
