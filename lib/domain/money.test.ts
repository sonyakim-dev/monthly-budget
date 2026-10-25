import { describe, expect, it } from 'vitest'
import { centsToDecimal, cleanAmountInput, formatMoney, formatWholeMoney, parseAmountInput, toCents } from './money'

describe('cleanAmountInput', () => {
  it.each([
    ['12.50', '12.50'],
    ['abc', ''],
    ['12a3', '123'],
    ['-5', '5'],
    ['1e3', '13'],
    ['$1,200.50', '1200.50'],
    ['12.505', '12.50'],
    ['1.2.', '1.2'],
    ['.5', '.5'],
    ['12345678901', '1234567890'],
  ])('keeps only an amount from %j: %j', (input, out) => {
    expect(cleanAmountInput(input)).toBe(out)
  })
})

describe('parseAmountInput', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['1,234.56', 123456],
    ['12,345,678', 1234567800],
    ['$7.05', 705],
    [' 3 ', 300],
    ['0.01', 1],
    ['.5', 50],
    ['.50', 50],
    ['12.', 1200],
    ['9999999999.99', 999999999999],
  ])('accepts %j as %i cents', (input, cents) => {
    expect(parseAmountInput(input)).toBe(cents)
  })

  it.each(['', '0', '0.00', '-5', '12.345', '1e3', '1,23', '12,34.5', 'abc', '$', '10000000000', '1.2.3', '.', '.123', '$.'])(
    'rejects %j',
    (input) => {
      expect(parseAmountInput(input)).toBeNull()
    },
  )
})

describe('toCents', () => {
  it('converts numbers and numeric strings without float drift', () => {
    expect(toCents(19.99)).toBe(1999)
    expect(toCents('12.34')).toBe(1234)
    expect(toCents(0)).toBe(0)
  })

  it('throws on non-numeric input', () => {
    expect(() => toCents('abc')).toThrow('Not a number')
  })
})

describe('centsToDecimal', () => {
  it('formats cents as a plain decimal string', () => {
    expect(centsToDecimal(123456)).toBe('1234.56')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(-250)).toBe('-2.50')
  })
})

describe('formatMoney', () => {
  it('formats USD with grouping and sign', () => {
    expect(formatMoney(123456)).toBe('$1,234.56')
    expect(formatMoney(0)).toBe('$0.00')
    expect(formatMoney(-34750)).toBe('-$347.50')
  })
})

describe('formatWholeMoney', () => {
  it('rounds to whole dollars for headline numbers', () => {
    expect(formatWholeMoney(116500)).toBe('$1,165')
    expect(formatWholeMoney(-171049)).toBe('-$1,710')
    expect(formatWholeMoney(244838)).toBe('$2,448')
    expect(formatWholeMoney(0)).toBe('$0')
  })
})
