// Turns a PDF's positioned text into a parsed payslip with review flags. Pure: no database, no file kept.
import { reconcile } from './reconcile'
import type { ParsedPayslip, TextItem } from './types'
import { matchesWorkday, parseWorkday } from './workday'

/** ready: can be saved as is · check: reconcile mismatch or unknown labels, open before saving. */
export type ParseStatus = 'ready' | 'check'

export type ParseResult =
  | { ok: true; payslip: ParsedPayslip; reconciled: boolean; differenceCents: number; unknownLabels: string[]; status: ParseStatus }
  | { ok: false; reason: 'no-text' | 'no-parser' }

const PARSERS = [{ name: 'workday', matches: matchesWorkday, parse: parseWorkday }]

export function parsePayslipItems(items: TextItem[]): ParseResult {
  if (items.length === 0) return { ok: false, reason: 'no-text' }
  const parser = PARSERS.find((p) => p.matches(items))
  if (!parser) return { ok: false, reason: 'no-parser' }
  const payslip = parser.parse(items)
  const { ok: reconciled, differenceCents } = reconcile(payslip)
  const unknownLabels = payslip.lines.filter((l) => l.unknown).map((l) => l.label)
  const status: ParseStatus = reconciled && unknownLabels.length === 0 && payslip.mismatches.length === 0 ? 'ready' : 'check'
  return { ok: true, payslip, reconciled, differenceCents, unknownLabels, status }
}
