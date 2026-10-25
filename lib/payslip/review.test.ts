import { describe, expect, it } from 'vitest'
import { matchJob, parseReviewForm } from './review'

const jobs = [
  { id: 'j1', name: 'Example Corp' },
  { id: 'j2', name: 'Northwind Labs' },
]

describe('matchJob', () => {
  it('matches the employer to a job by name, ignoring case and spacing', () => {
    expect(matchJob('example corp', jobs)).toBe('j1')
    expect(matchJob('Northwind  Labs ', jobs)).toBe('j2')
  })

  it('matches when the employer name starts with the job name, or the other way round', () => {
    expect(matchJob('Example Corp 100 Example Street', jobs)).toBe('j1')
    expect(matchJob('Example', jobs)).toBe('j1')
  })

  it('gives null when nothing fits', () => {
    expect(matchJob('Fabrikam', jobs)).toBeNull()
  })
})

describe('parseReviewForm', () => {
  const JOB = '3f1c2b9e-8d4a-4c6b-9e2f-1a2b3c4d5e6f'
  const base = { jobId: JOB, checkDate: '2026-04-10', periodStart: '2026-03-22', periodEnd: '2026-04-04', payType: 'regular', grossCents: 406000, netCents: 236000, reconciled: true, parseMethod: 'workday', lines: [{ label: 'Regular Pay', kind: 'earning', tag: 'base', cents: 403000 }] }

  it('accepts a reviewed payslip', () => {
    const r = parseReviewForm(base)
    expect(r.ok).toBe(true)
  })

  it('refuses a line with a bad tag or amount, a missing job, or a date that does not exist', () => {
    expect(parseReviewForm({ ...base, lines: [{ ...base.lines[0], tag: 'bonus_x' }] }).ok).toBe(false)
    expect(parseReviewForm({ ...base, lines: [{ ...base.lines[0], cents: -1 }] }).ok).toBe(false)
    expect(parseReviewForm({ ...base, jobId: '' }).ok).toBe(false)
    expect(parseReviewForm({ ...base, checkDate: '2026-02-30' }).ok).toBe(false)
  })

  it('allows a new job instead of an existing one', () => {
    const r = parseReviewForm({ ...base, jobId: 'new', newJob: { name: 'Example Corp', payFrequency: 'biweekly' } })
    expect(r.ok && r.data.jobId).toBe('new')
  })
})
