import { describe, expect, it } from 'vitest'
import { occurrences, versionAt } from './schedule'

describe('occurrences', () => {
  it('steps weekly from the start and stops at the end date', () => {
    expect(occurrences({ frequency: 'weekly', start: '2026-10-02', end: '2026-10-24' }, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23',
    ])
  })

  it('only returns dates inside the range, even when the schedule started earlier', () => {
    expect(occurrences({ frequency: 'biweekly', start: '2026-01-02', end: null }, '2026-03-01', '2026-03-31')).toEqual([
      '2026-03-13', '2026-03-27',
    ])
  })

  it('keeps the same day each month, clamped to short months', () => {
    expect(occurrences({ frequency: 'monthly', start: '2026-01-31', end: null }, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28', '2026-03-31', '2026-04-30',
    ])
  })

  it('pays semimonthly on the 15th and the last day', () => {
    expect(occurrences({ frequency: 'semimonthly', start: '2026-02-01', end: null }, '2026-02-01', '2026-02-28')).toEqual([
      '2026-02-15', '2026-02-28',
    ])
  })

  it('returns a one-time date only if it falls in the range', () => {
    expect(occurrences({ frequency: 'once', start: '2026-10-11', end: null }, '2026-10-01', '2026-10-31')).toEqual(['2026-10-11'])
    expect(occurrences({ frequency: 'once', start: '2026-11-11', end: null }, '2026-10-01', '2026-10-31')).toEqual([])
  })

  it('returns nothing before the schedule starts', () => {
    expect(occurrences({ frequency: 'weekly', start: '2026-11-01', end: null }, '2026-10-01', '2026-10-31')).toEqual([])
  })
})

describe('versionAt', () => {
  const versions = [
    { from: '2026-01', value: 1250 },
    { from: '2026-11', value: 2480.5 },
  ]

  it('uses the latest version starting on or before the date', () => {
    expect(versionAt(versions, '2026-10')).toBe(1250)
    expect(versionAt(versions, '2026-11')).toBe(2480.5)
    expect(versionAt(versions, '2027-05')).toBe(2480.5)
  })

  it('returns null before the first version', () => {
    expect(versionAt(versions, '2025-12')).toBeNull()
  })

  it('does not depend on the order versions are given in', () => {
    expect(versionAt([...versions].reverse(), '2026-12')).toBe(2480.5)
  })
})
