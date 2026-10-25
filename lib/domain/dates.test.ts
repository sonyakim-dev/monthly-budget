import { describe, expect, it } from 'vitest'
import {
  addDays,
  addMonths,
  formatMonthLabel,
  formatMonthShort,
  isValidIsoDate,
  monthKeyOf,
  monthStart,
  parseMonthKey,
  todayInTimeZone,
} from './dates'

describe('todayInTimeZone', () => {
  it('uses the given time zone, not UTC (23:30 Pacific is still the same day)', () => {
    const instant = new Date('2026-10-14T06:30:00Z') // 2026-10-13 23:30 in Los Angeles
    expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-10-13')
    expect(todayInTimeZone('Asia/Seoul', instant)).toBe('2026-10-14')
  })

  it('handles the last evening of a month', () => {
    const instant = new Date('2026-11-01T05:00:00Z') // 2026-10-31 22:00 in Los Angeles
    expect(monthKeyOf(todayInTimeZone('America/Los_Angeles', instant))).toBe('2026-10')
  })
})

describe('isValidIsoDate', () => {
  it.each(['2026-01-31', '2028-02-29', '2026-12-01'])('accepts %s', (d) => {
    expect(isValidIsoDate(d)).toBe(true)
  })
  it.each(['2026-02-30', '2027-02-29', '2026-13-01', '2026-1-5', '20260105', '', 'not a date'])(
    'rejects %j',
    (d) => {
      expect(isValidIsoDate(d)).toBe(false)
    },
  )
})

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2026-10-13', -90)).toBe('2026-07-15')
  })
})

describe('month keys', () => {
  it('parses only YYYY-MM with a real month', () => {
    expect(parseMonthKey('2026-10')).toBe('2026-10')
    expect(parseMonthKey('2026-13')).toBeNull()
    expect(parseMonthKey('2026-00')).toBeNull()
    expect(parseMonthKey('2026-1')).toBeNull()
    expect(parseMonthKey('')).toBeNull()
    expect(parseMonthKey(undefined)).toBeNull()
  })

  it('rejects years the database or date formatting cannot handle', () => {
    expect(parseMonthKey('0000-01')).toBeNull()
    expect(parseMonthKey('0050-01')).toBeNull()
    expect(parseMonthKey('1899-12')).toBeNull()
    expect(parseMonthKey('1900-01')).toBe('1900-01')
    expect(parseMonthKey('2999-12')).toBe('2999-12')
    expect(parseMonthKey('3000-01')).toBeNull()
  })

  it('derives keys and month starts', () => {
    expect(monthKeyOf('2026-01-31')).toBe('2026-01')
    expect(monthStart('2026-01')).toBe('2026-01-01')
  })

  it('adds months across year boundaries', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
    expect(addMonths('2026-10', 12)).toBe('2027-10')
    expect(addMonths('2026-10', -22)).toBe('2024-12')
  })

  it('formats a readable label', () => {
    expect(formatMonthLabel('2026-10')).toBe('October 2026')
    expect(formatMonthLabel('2027-01')).toBe('January 2027')
  })

  it('formats a short label for compact cards', () => {
    expect(formatMonthShort('2026-09')).toBe('Sep 2026')
    expect(formatMonthShort('2025-12')).toBe('Dec 2025')
  })

})
