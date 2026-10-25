// Parser for the standard Workday pay slip layout.
// Amounts are right-aligned under their column headers, so each number is assigned to a
// column by its right edge, never by counting numbers on a line (many lines have only a
// YTD figure). Only the current-period "Amount" column is read.
import { formatMoney } from '@/lib/domain/money'
import type { LineKind, LineTag, ParsedPayslip, PayType, PayslipLine, TextItem } from './types'

const SECTION_HEADERS = ['Employee Taxes', 'Pre Tax Deductions', 'Post Tax Deductions', 'Employer Paid Benefits', 'Taxable Wages']

const NUMBER_RE = /^-?[\d,]*\.?\d+$/
const DATE_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/
const DATE_RANGE_RE = /\s*\d{2}\/\d{2}\/\d{4}\s*-\s*\d{2}\/\d{2}\/\d{4}\s*/g
const ROW_TOLERANCE = 2
const COLUMN_TOLERANCE = 2

type Row = { y: number; items: TextItem[] }
type Column = { name: string; right: number }
type Rule = { match: string | RegExp; tag: LineTag } | { match: string | RegExp; skip: true }

const RULES: Record<LineKind, Rule[]> = {
  earning: [
    { match: /imputed income/i, skip: true },
    { match: /^RSU Gain$/i, skip: true },
    { match: /^(Regular Pay|Flexible Vacation|Vacation|Holiday|Sick|PTO)$/i, tag: 'base' },
    { match: /^Phone Allowance$/i, tag: 'allowance' },
    { match: /^Notice Pay$/i, tag: 'notice_pay' },
    { match: /^Severance$/i, tag: 'severance' },
    { match: /^COBRA Assistance$/i, tag: 'cobra_assist' },
    { match: /^Bonus$/i, tag: 'bonus' },
    { match: /^NonCash Gross Up/i, tag: 'other' },
  ],
  tax: [
    { match: /^OASDI$/i, tag: 'ss' },
    { match: /^Medicare$/i, tag: 'medicare' },
    { match: /^Federal Withholding$/i, tag: 'federal' },
    { match: /^State Tax/i, tag: 'state' },
    { match: /(VPDI|SDI)/i, tag: 'sdi' },
  ],
  pretax: [
    { match: /^401k$/i, tag: 'trad_401k' },
    { match: /^HSA EE$/i, tag: 'hsa' },
  ],
  posttax: [
    { match: /^RSU Offset$/i, skip: true },
    { match: /^401k Roth$/i, tag: 'roth_401k' },
    { match: /^Gross Up Offset/i, tag: 'other' },
  ],
  employer: [
    { match: /^401k Match$/i, tag: '401k_match' },
    { match: /^HSA ER Contribution$/i, tag: 'hsa_match' },
  ],
}

export function matchesWorkday(items: TextItem[]): boolean {
  const texts = new Set(items.map((i) => i.str.trim()))
  return SECTION_HEADERS.every((h) => texts.has(h))
}

function groupRows(items: TextItem[]): Row[] {
  const sorted = items
    .filter((i) => i.str.trim() !== '')
    .map((i) => ({ ...i, str: i.str.trim() }))
    .sort((a, b) => b.y - a.y || a.x - b.x)
  const rows: Row[] = []
  for (const item of sorted) {
    const row = rows.at(-1)
    if (row && Math.abs(row.y - item.y) <= ROW_TOLERANCE) row.items.push(item)
    else rows.push({ y: item.y, items: [item] })
  }
  for (const row of rows) row.items.sort((a, b) => a.x - b.x)
  return rows
}

const isNumber = (s: string) => NUMBER_RE.test(s)
const toCents = (s: string) => Math.round(Number(s.replace(/,/g, '')) * 100)

function toIso(s: string): string | null {
  const m = DATE_RE.exec(s)
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null
}

function classify(kind: LineKind, label: string): { tag: LineTag; unknown?: true } | null {
  for (const rule of RULES[kind]) {
    const hit = typeof rule.match === 'string' ? rule.match === label : rule.match.test(label)
    if (hit) return 'skip' in rule ? null : { tag: rule.tag }
  }
  // Unknown employer-paid benefits (insurance, EAP…) aren't part of pay; anything else is kept for review.
  return kind === 'employer' ? null : { tag: 'other', unknown: true }
}

/** Label and current-period amount for one half of a row. */
function readSide(items: TextItem[], columns: Column[]): { label: string; cents: number | null } {
  const label = items
    .filter((i) => !isNumber(i.str))
    .map((i) => i.str.replace(DATE_RANGE_RE, ' ').trim())
    .filter(Boolean)
    .join(' ')
  let cents: number | null = null
  for (const i of items.filter((i) => isNumber(i.str))) {
    const right = i.x + i.width
    const column = columns.find((c) => Math.abs(c.right - right) <= COLUMN_TOLERANCE)
    if (column?.name === 'Amount') cents = toCents(i.str)
  }
  return { label, cents }
}

const BLOCKS: Record<string, [LineKind, LineKind | null]> = {
  Earnings: ['earning', 'tax'],
  'Pre Tax Deductions': ['pretax', 'posttax'],
  'Employer Paid Benefits': ['employer', null],
}

export function parseWorkday(items: TextItem[]): ParsedPayslip {
  const rows = groupRows(items)

  // Header: the row under "Check Date" holds the company name and three dates.
  const headerIndex = rows.findIndex((r) => r.items.some((i) => i.str === 'Check Date'))
  const companyX = rows[headerIndex]?.items.find((i) => i.str === 'Company')?.x
  const valueRow = rows[headerIndex + 1]?.items ?? []
  const dates = valueRow.map((i) => toIso(i.str)).filter((d): d is string => d !== null)
  const employer = valueRow.find((i) => companyX !== undefined && Math.abs(i.x - companyX) <= 3)?.str ?? ''
  const [periodStart, periodEnd, checkDate] = dates.length >= 3 ? dates : [null, null, dates.at(-1) ?? '']

  // Summary: Current row → hours, gross, pre-tax, taxes, post-tax, net.
  const current = rows.find((r) => r.items[0]?.str === 'Current')?.items.filter((i) => isNumber(i.str)) ?? []
  const [, gross, pretax, taxes, posttax, net] = current.map((i) => toCents(i.str))
  const statementTotals = {
    grossCents: gross ?? 0,
    pretaxCents: pretax ?? 0,
    taxCents: taxes ?? 0,
    posttaxCents: posttax ?? 0,
    netCents: net ?? 0,
  }

  const sums = new Map<string, PayslipLine>()
  const add = (kind: LineKind, label: string, cents: number) => {
    const c = classify(kind, label)
    if (!c) return
    const key = `${kind}|${c.tag}|${label}`
    const existing = sums.get(key)
    if (existing) existing.cents += cents
    else sums.set(key, { label, kind, tag: c.tag, cents, ...(c.unknown ? { unknown: true } : {}) })
  }

  rows.forEach((row, index) => {
    const isColumnHeader = row.items[0]?.str === 'Description' && row.items.filter((i) => i.str === 'Description').length === 2
    if (!isColumnHeader) return
    const title = rows[index - 1]?.items[0]?.str ?? ''
    const kinds = BLOCKS[title]
    if (!kinds) return
    const split = row.items.filter((i) => i.str === 'Description')[1].x - 1
    const columns = row.items
      .filter((i) => i.str !== 'Description' && i.str !== 'Dates')
      .map((i) => ({ name: i.str, right: i.x + i.width, left: i.x < split }))
    const leftColumns = columns.filter((c) => c.left)
    const rightColumns = columns.filter((c) => !c.left)

    for (const dataRow of rows.slice(index + 1)) {
      const first = dataRow.items[0]
      if (first && first.x < 45 && first.str === title) break // the section's totals row
      const left = readSide(dataRow.items.filter((i) => i.x < split), leftColumns)
      if (left.label && left.cents !== null) add(kinds[0], left.label, left.cents)
      if (kinds[1]) {
        const right = readSide(dataRow.items.filter((i) => i.x >= split), rightColumns)
        if (right.label && right.cents !== null) add(kinds[1], right.label, right.cents)
      }
    }
  })

  const lines = [...sums.values()]
  const total = (kind: LineKind) => lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.cents, 0)
  const mismatches = (
    [
      ['gross', total('earning'), statementTotals.grossCents],
      ['pretax', total('pretax'), statementTotals.pretaxCents],
      ['taxes', total('tax'), statementTotals.taxCents],
      ['posttax', total('posttax'), statementTotals.posttaxCents],
    ] as const
  )
    .filter(([, parsed, statement]) => parsed !== statement)
    .map(([name, parsed, statement]) => `${name}: parsed ${formatMoney(parsed)}, statement ${formatMoney(statement)}`)

  const payType: PayType = lines.some((l) => l.tag === 'severance')
    ? 'severance'
    : lines.some((l) => l.tag === 'notice_pay')
      ? 'notice'
      : 'regular'

  return {
    parser: 'workday',
    employer,
    checkDate: checkDate ?? '',
    periodStart,
    periodEnd,
    payType,
    grossCents: statementTotals.grossCents,
    netCents: statementTotals.netCents,
    lines,
    statementTotals,
    mismatches,
  }
}
