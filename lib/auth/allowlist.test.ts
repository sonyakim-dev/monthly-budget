import { describe, expect, it } from 'vitest'
import { isEmailAllowed, parseAllowlist } from './allowlist'

describe('parseAllowlist', () => {
  it('splits, trims, lowercases and drops blanks', () => {
    expect([...parseAllowlist(' A@Example.test, b@example.test ,,')]).toEqual(['a@example.test', 'b@example.test'])
  })
})

describe('isEmailAllowed', () => {
  const raw = 'owner@example.test, partner@example.test'

  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(isEmailAllowed('OWNER@example.test', raw)).toBe(true)
    expect(isEmailAllowed(' partner@example.test ', raw)).toBe(true)
  })

  it('rejects emails not on the list', () => {
    expect(isEmailAllowed('stranger@example.test', raw)).toBe(false)
    expect(isEmailAllowed('owner@example.test.evil', raw)).toBe(false)
  })

  it('rejects everyone when the list is empty or missing', () => {
    expect(isEmailAllowed('owner@example.test', '')).toBe(false)
    expect(isEmailAllowed('owner@example.test', undefined)).toBe(false)
  })

  it('rejects missing emails', () => {
    expect(isEmailAllowed(undefined, raw)).toBe(false)
    expect(isEmailAllowed(null, raw)).toBe(false)
    expect(isEmailAllowed('', raw)).toBe(false)
  })
})
