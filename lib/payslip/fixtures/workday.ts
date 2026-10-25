// Test-only: builds the text items of a synthetic Workday-style pay slip, placed the way
// the real layout places them (labels on the left of each half, numbers right-aligned
// under their column headers). All names and amounts are made up.
import type { TextItem } from '../types'

export type FixtureLine = { label: string; current?: number; ytd?: number; dates?: string; hours?: number; rate?: number }

export type WorkdaySpec = {
  employee: string
  company: string
  employeeId: string
  periodStart: string // MM/DD/YYYY
  periodEnd: string
  checkDate: string
  summary: { gross: number; pretax: number; taxes: number; posttax: number; net: number }
  earnings: FixtureLine[]
  taxes: FixtureLine[]
  pretax: FixtureLine[]
  posttax: FixtureLine[]
  employer: FixtureLine[]
}

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function buildWorkdayItems(spec: WorkdaySpec): TextItem[] {
  const items: TextItem[] = []
  let y = 670
  const text = (str: string, x: number) => items.push({ str, x, y, width: str.length * 4 })
  const right = (str: string, r: number) => items.push({ str, x: r - str.length * 4.4, y, width: str.length * 4.4 })
  const next = () => (y -= 9)

  text(`${spec.company} 100 Example Street Springfield`, 206); next()
  text('Name', 37); text('Company', 145); text('Employee ID', 287); text('Pay Period Begin', 338); text('Pay Period End', 409); text('Check Date', 486); text('Check Number', 529); next()
  text(spec.employee, 37); text(spec.company, 145); text(spec.employeeId, 299); text(spec.periodStart, 357); text(spec.periodEnd, 422); text(spec.checkDate, 487); next()
  text('Hours Worked', 172); text('Gross Pay', 255); text('Pre Tax Deductions', 299); text('Employee Taxes', 380); text('Post Tax Deductions', 440); text('Net Pay', 550); next()
  const s = spec.summary
  text('Current', 37); [0, s.gross, s.pretax, s.taxes, s.posttax, s.net].forEach((v, i) => right(money(v), [216, 289, 364, 431, 503, 574][i])); next()
  text('YTD', 37); [0, s.gross * 10, s.pretax * 10, s.taxes * 10, s.posttax * 10, s.net * 10].forEach((v, i) => right(money(v), [216, 289, 364, 431, 503, 574][i])); next()

  // Earnings | Employee Taxes
  text('Earnings', 189); text('Employee Taxes', 449); next()
  text('Description', 37); text('Dates', 135)
  items.push({ str: 'Hours', x: 227.3, y, width: 18.2 }, { str: 'Rate', x: 259.9, y, width: 14.4 })
  items.push({ str: 'Amount', x: 297.6, y, width: 23.5 }, { str: 'YTD', x: 353.3, y, width: 13.6 })
  text('Description', 372.9)
  items.push({ str: 'Amount', x: 505.2, y, width: 23.5 }, { str: 'YTD', x: 560.9, y, width: 13.6 })
  next()
  const rows = Math.max(spec.earnings.length, spec.taxes.length)
  for (let i = 0; i < rows; i++) {
    const e = spec.earnings[i]
    if (e) {
      text(e.label, 37)
      if (e.dates) text(e.dates, 135)
      if (e.hours !== undefined) right(String(e.hours), 245.5)
      right(String(e.rate ?? 0), 274.3)
      if (e.current !== undefined) right(money(e.current), 321.1)
      if (e.ytd !== undefined) right(money(e.ytd), 366.9)
    }
    const t = spec.taxes[i]
    if (t) {
      text(t.label, 373)
      if (t.current !== undefined) right(money(t.current), 528.7)
      if (t.ytd !== undefined) right(money(t.ytd), 574.5)
    }
    next()
  }
  text('Earnings', 38); right(money(s.gross), 321.1); text('Employee Taxes', 374); right(money(s.taxes), 528.7); next()

  // Pre Tax | Post Tax Deductions, then Employer Paid Benefits | Taxable Wages
  const halves = (title: [string, number, string, number], left: FixtureLine[], rightLines: FixtureLine[], totals: [string, number | null, string | null, number | null]) => {
    text(title[0], title[1]); text(title[2], title[3]); next()
    text('Description', 37)
    items.push({ str: 'Amount', x: 238.1, y, width: 23.4 }, { str: 'YTD', x: 293.7, y, width: 13.6 })
    text('Description', 313.3)
    items.push({ str: 'Amount', x: 505.2, y, width: 23.5 }, { str: 'YTD', x: 560.9, y, width: 13.6 })
    next()
    for (let i = 0; i < Math.max(left.length, rightLines.length); i++) {
      const l = left[i]
      if (l) { text(l.label, 37); if (l.current !== undefined) right(money(l.current), 261.5); if (l.ytd !== undefined) right(money(l.ytd), 307.3) }
      const r = rightLines[i]
      if (r) { text(r.label, 313.3); if (r.current !== undefined) right(money(r.current), 528.7); if (r.ytd !== undefined) right(money(r.ytd), 574.5) }
      next()
    }
    text(totals[0], 38); if (totals[1] !== null) right(money(totals[1]), 261.5)
    if (totals[2]) { text(totals[2], 315); if (totals[3] !== null) right(money(totals[3]), 528.7) }
    next()
  }
  halves(['Pre Tax Deductions', 143, 'Post Tax Deductions', 413], spec.pretax, spec.posttax,
    ['Pre Tax Deductions', s.pretax, 'Post Tax Deductions', s.posttax])
  halves(['Employer Paid Benefits', 137, 'Taxable Wages', 421], spec.employer,
    [{ label: 'OASDI - Taxable Wages', current: s.gross, ytd: s.gross * 10 }],
    ['Employer Paid Benefits', null, null, null])

  text('Payment Information', 275); next()
  text('Bank', 37); text('Account Name', 172); text('Account Number', 320); next()
  text('Example Bank', 37); text('Checking', 172); text('******0000', 320); right(money(s.net), 556); next()
  return items
}

/** A regular paycheck: YTD-only lines, imputed income, two "Regular Pay" lines (mid-period raise). */
export const regularSpec: WorkdaySpec = {
  employee: 'Jane Example',
  company: 'Example Corp',
  employeeId: '000000',
  periodStart: '03/22/2026',
  periodEnd: '04/04/2026',
  checkDate: '04/10/2026',
  summary: { gross: 4060, pretax: 500, taxes: 900, posttax: 300, net: 2360 },
  earnings: [
    { label: 'Basic Life Imputed Income-Ben', dates: '03/22/2026 - 04/04/2026', current: 6.1, ytd: 50 },
    { label: 'Holiday', ytd: 800 },
    { label: 'Phone Allowance', dates: '03/22/2026 - 04/04/2026', current: 30, ytd: 240 },
    { label: 'Regular Pay', dates: '03/22/2026 - 03/31/2026', rate: 50, current: 2800 },
    { label: 'Regular Pay', dates: '04/01/2026 - 04/04/2026', rate: 52.5, current: 1230, ytd: 30000 },
    { label: 'RSU Gain', ytd: 5000 },
  ],
  taxes: [
    { label: 'OASDI', current: 240, ytd: 2400 },
    { label: 'Medicare', current: 60, ytd: 600 },
    { label: 'Federal Withholding', current: 400, ytd: 4000 },
    { label: 'State Tax - CA', current: 160, ytd: 1600 },
    { label: 'VPDI - CAVDI', current: 40, ytd: 400 },
  ],
  pretax: [
    { label: '401k', current: 400, ytd: 4000 },
    { label: 'HSA EE', current: 100, ytd: 1000 },
  ],
  posttax: [
    { label: '401k Roth', current: 300, ytd: 3000 },
    { label: 'Gross Up Offset (Wellness - Forma)', ytd: 150 },
    { label: 'RSU Offset', ytd: 2500 },
  ],
  employer: [
    { label: '401k Match', current: 160, ytd: 1600 },
    { label: 'Dental PPO ER', current: 20, ytd: 200 },
    { label: 'HSA ER Contribution', current: 40, ytd: 400 },
  ],
}

/** A notice-pay statement: special earnings, no deductions. */
export const noticeSpec: WorkdaySpec = {
  ...regularSpec,
  periodStart: '04/05/2026',
  periodEnd: '04/18/2026',
  checkDate: '04/16/2026',
  summary: { gross: 21000, pretax: 0, taxes: 7000, posttax: 0, net: 14000 },
  earnings: [
    { label: 'COBRA Assistance', dates: '04/05/2026 - 04/16/2026', current: 3000, ytd: 3000 },
    { label: 'Holiday', ytd: 800 },
    { label: 'Notice Pay', dates: '04/05/2026 - 04/16/2026', current: 18000, ytd: 18000 },
  ],
  taxes: [
    { label: 'OASDI', current: 1300, ytd: 3700 },
    { label: 'Medicare', current: 300, ytd: 900 },
    { label: 'Federal Withholding', current: 4000, ytd: 8000 },
    { label: 'State Tax - CA', current: 1200, ytd: 2800 },
    { label: 'VPDI - CAVDI', current: 200, ytd: 600 },
  ],
  pretax: [{ label: '401k', ytd: 4000 }],
  posttax: [{ label: '401k Roth', ytd: 3000 }],
  employer: [{ label: '401k Match', ytd: 1600 }],
}
