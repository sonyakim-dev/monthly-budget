import { describe, expect, it } from 'vitest'
import { buildWorkdayItems, regularSpec } from './fixtures/workday'
import { parsePayslipItems } from './parse'

describe('parsePayslipItems', () => {
  it('parses a Workday statement, reconciles it and reports it ready', () => {
    const r = parsePayslipItems(buildWorkdayItems(regularSpec))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payslip.employer).toBe('Example Corp')
    expect(r.payslip.netCents).toBe(236000)
    expect(r.reconciled).toBe(true)
    expect(r.unknownLabels).toEqual([])
    expect(r.status).toBe('ready')
  })

  it('flags unknown labels for review', () => {
    const spec = { ...regularSpec, earnings: [...regularSpec.earnings, { label: 'Wellness Stipend', current: 50, ytd: 50 }] }
    spec.summary = { ...spec.summary, gross: 4110, net: 2410 }
    const r = parsePayslipItems(buildWorkdayItems(spec))
    expect(r.ok && r.unknownLabels).toEqual(['Wellness Stipend'])
    expect(r.ok && r.status).toBe('check')
  })

  it('flags a statement that does not reconcile', () => {
    const spec = { ...regularSpec, summary: { ...regularSpec.summary, net: 2300 } }
    const r = parsePayslipItems(buildWorkdayItems(spec))
    expect(r.ok && r.reconciled).toBe(false)
    expect(r.ok && r.status).toBe('check')
  })

  it('says when no parser matches', () => {
    const r = parsePayslipItems([{ str: 'Earnings Statement', x: 10, y: 700, width: 80 }])
    expect(r).toEqual({ ok: false, reason: 'no-parser' })
  })

  it('says when the PDF has no text', () => {
    expect(parsePayslipItems([])).toEqual({ ok: false, reason: 'no-text' })
  })
})
