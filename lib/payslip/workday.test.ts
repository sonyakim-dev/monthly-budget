import { describe, expect, it } from 'vitest'
import { buildWorkdayItems, noticeSpec, regularSpec } from './fixtures/workday'
import { reconcile } from './reconcile'
import { matchesWorkday, parseWorkday } from './workday'

const line = (p: ReturnType<typeof parseWorkday>, tag: string) => p.lines.filter((l) => l.tag === tag)

describe('matchesWorkday', () => {
  it('recognizes the Workday section headers', () => {
    expect(matchesWorkday(buildWorkdayItems(regularSpec))).toBe(true)
  })

  it('rejects other documents', () => {
    expect(matchesWorkday([{ str: 'Earnings Statement', x: 10, y: 700, width: 80 }])).toBe(false)
  })
})

describe('parseWorkday · regular paycheck', () => {
  const p = parseWorkday(buildWorkdayItems(regularSpec))

  it('reads the header', () => {
    expect(p.employer).toBe('Example Corp')
    expect(p.checkDate).toBe('2026-04-10')
    expect(p.periodStart).toBe('2026-03-22')
    expect(p.periodEnd).toBe('2026-04-04')
    expect(p.payType).toBe('regular')
  })

  it('uses Gross Pay and Net Pay from the statement', () => {
    expect(p.grossCents).toBe(406000)
    expect(p.netCents).toBe(236000)
  })

  it('adds up repeated labels and reads only this-period amounts', () => {
    expect(line(p, 'base')).toEqual([{ label: 'Regular Pay', kind: 'earning', tag: 'base', cents: 403000 }])
    expect(line(p, 'allowance')[0].cents).toBe(3000)
  })

  it('skips imputed income, YTD-only lines, RSU lines and employer insurance', () => {
    const labels = p.lines.map((l) => l.label)
    expect(labels).not.toContain('Basic Life Imputed Income-Ben')
    expect(labels).not.toContain('Holiday')
    expect(labels).not.toContain('RSU Gain')
    expect(labels).not.toContain('RSU Offset')
    expect(labels).not.toContain('Gross Up Offset (Wellness - Forma)')
    expect(labels).not.toContain('Dental PPO ER')
  })

  it('tags deductions, taxes and employer contributions', () => {
    const byTag = Object.fromEntries(p.lines.map((l) => [l.tag, [l.kind, l.cents]]))
    expect(byTag.trad_401k).toEqual(['pretax', 40000])
    expect(byTag.hsa).toEqual(['pretax', 10000])
    expect(byTag.roth_401k).toEqual(['posttax', 30000])
    expect(byTag.ss).toEqual(['tax', 24000])
    expect(byTag.medicare).toEqual(['tax', 6000])
    expect(byTag.federal).toEqual(['tax', 40000])
    expect(byTag.state).toEqual(['tax', 16000])
    expect(byTag.sdi).toEqual(['tax', 4000])
    expect(byTag['401k_match']).toEqual(['employer', 16000])
    expect(byTag.hsa_match).toEqual(['employer', 4000])
  })

  it('passes its self-check and reconciles', () => {
    expect(p.mismatches).toEqual([])
    expect(reconcile(p)).toEqual({ ok: true, differenceCents: 0 })
  })
})

describe('parseWorkday · notice pay', () => {
  const p = parseWorkday(buildWorkdayItems(noticeSpec))

  it('detects the pay type and special earnings', () => {
    expect(p.payType).toBe('notice')
    expect(line(p, 'notice_pay')[0].cents).toBe(1800000)
    expect(line(p, 'cobra_assist')[0].cents).toBe(300000)
  })

  it('has no deductions and reconciles', () => {
    expect(p.lines.filter((l) => l.kind === 'pretax' || l.kind === 'posttax')).toEqual([])
    expect(p.mismatches).toEqual([])
    expect(reconcile(p).ok).toBe(true)
  })
})

describe('parseWorkday · edge cases', () => {
  it('detects severance', () => {
    const spec = {
      ...noticeSpec,
      earnings: [
        { label: 'COBRA Assistance', current: 3000, ytd: 6000 },
        { label: 'Notice Pay', ytd: 18000 },
        { label: 'Severance', current: 18000, ytd: 18000 },
      ],
    }
    expect(parseWorkday(buildWorkdayItems(spec)).payType).toBe('severance')
  })

  it('keeps an unknown label as "other", flagged, so the totals still match', () => {
    const spec = { ...regularSpec, posttax: [{ label: '401k Roth', current: 250, ytd: 2500 }, { label: 'Charity Gift', current: 50, ytd: 50 }] }
    const p = parseWorkday(buildWorkdayItems(spec))
    expect(p.lines.find((l) => l.label === 'Charity Gift')).toEqual({ label: 'Charity Gift', kind: 'posttax', tag: 'other', cents: 5000, unknown: true })
    expect(p.mismatches).toEqual([])
  })

  it('reports a section that does not add up to the statement total', () => {
    const spec = { ...regularSpec, summary: { ...regularSpec.summary, taxes: 950, net: 2310 } }
    expect(parseWorkday(buildWorkdayItems(spec)).mismatches).toEqual(['taxes: parsed $900.00, statement $950.00'])
  })
})

describe('reconcile', () => {
  it('reports the difference when gross minus deductions is not net', () => {
    const p = parseWorkday(buildWorkdayItems(regularSpec))
    expect(reconcile({ ...p, netCents: p.netCents - 3 })).toEqual({ ok: false, differenceCents: 3 })
  })

  it('tolerates one cent of rounding', () => {
    const p = parseWorkday(buildWorkdayItems(regularSpec))
    expect(reconcile({ ...p, netCents: p.netCents + 1 }).ok).toBe(true)
  })
})
