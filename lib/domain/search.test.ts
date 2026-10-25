import { describe, expect, it } from 'vitest'
import { escapeLike, merchantMatches, merchantPattern } from './search'

describe('escapeLike', () => {
  it('escapes LIKE wildcards and the escape character', () => {
    expect(escapeLike('50%_off\\now')).toBe('50\\%\\_off\\\\now')
  })

  it('leaves commas and parentheses alone (they are safe in an ilike filter)', () => {
    expect(escapeLike('Joe, Inc. (SF)')).toBe('Joe, Inc. (SF)')
  })
})

describe('merchantPattern', () => {
  it('wraps the escaped, trimmed term in wildcards', () => {
    expect(merchantPattern('  50% ')).toBe('%50\\%%')
  })

  it('returns null for blank input', () => {
    expect(merchantPattern('   ')).toBeNull()
  })
})

describe('merchantMatches', () => {
  it('matches a literal, case-insensitive substring', () => {
    expect(merchantMatches('SQ *Corner Cafe', 'sq *corner')).toBe(true)
    expect(merchantMatches('50% off sale', '50%')).toBe(true)
  })

  it('treats * as a character, not a wildcard', () => {
    expect(merchantMatches("Trader Joe's", 'Trader*s')).toBe(false)
  })

  it('never matches a missing merchant', () => {
    expect(merchantMatches(null, 'cafe')).toBe(false)
  })
})
