import { describe, expect, it } from 'vitest'
import { clampMonth, monthRange } from './range'

describe('monthRange', () => {
  it('runs from the first month with data to 12 months after the current month', () => {
    expect(monthRange('2026-01', '2026-10')).toEqual({ min: '2026-01', max: '2027-10' })
  })

  it('starts at the current month when there is no data yet', () => {
    expect(monthRange(null, '2026-10')).toEqual({ min: '2026-10', max: '2027-10' })
  })

  it('never starts after the current month', () => {
    expect(monthRange('2026-12', '2026-10')).toEqual({ min: '2026-10', max: '2027-10' })
  })
})

describe('clampMonth', () => {
  const range = { min: '2026-01', max: '2027-10' }

  it('keeps a month inside the range', () => {
    expect(clampMonth('2026-05', range)).toBe('2026-05')
  })

  it('moves a month outside the range to the nearest end', () => {
    expect(clampMonth('2025-06', range)).toBe('2026-01')
    expect(clampMonth('2030-01', range)).toBe('2027-10')
  })
})
