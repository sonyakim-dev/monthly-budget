/** One piece of text on a PDF page, positioned in PDF points (y grows upward). */
export type TextItem = { str: string; x: number; y: number; width: number }

export type LineKind = 'earning' | 'pretax' | 'tax' | 'posttax' | 'employer'

export type LineTag =
  | 'base' | 'allowance' | 'notice_pay' | 'severance' | 'cobra_assist' | 'bonus'
  | 'trad_401k' | 'roth_401k' | 'hsa'
  | 'federal' | 'state' | 'ss' | 'medicare' | 'sdi'
  | '401k_match' | 'hsa_match' | 'other'

export type PayslipLine = {
  label: string
  kind: LineKind
  tag: LineTag
  cents: number
  /** The label isn't in the parser's mapping; it was kept as `other` and should be checked on review. */
  unknown?: boolean
}

export type PayType = 'regular' | 'notice' | 'severance' | 'bonus' | 'other'

export type ParsedPayslip = {
  parser: string
  employer: string
  checkDate: string
  periodStart: string | null
  periodEnd: string | null
  payType: PayType
  grossCents: number
  netCents: number
  lines: PayslipLine[]
  /** The statement's own "Current" totals, used for the self-check. */
  statementTotals: { grossCents: number; pretaxCents: number; taxCents: number; posttaxCents: number; netCents: number }
  /** Sections whose parsed lines don't add up to the statement's totals. Empty when everything matches. */
  mismatches: string[]
}
