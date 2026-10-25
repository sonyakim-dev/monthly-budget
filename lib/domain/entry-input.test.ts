import { describe, expect, it } from 'vitest'
import { NEW_CATEGORY, parseEntryForm } from './entry-input'

const CAT = '3f1c2b9e-8d4a-4c6b-9e2f-1a2b3c4d5e6f'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('parseEntryForm', () => {
  it('reads an expense', () => {
    expect(parseEntryForm(form({ amount: '12.50', name: ' Corner store ', date: '2026-01-05', categoryId: CAT }), 'expense')).toEqual({
      ok: true,
      data: { amountCents: 1250, name: 'Corner store', date: '2026-01-05', categoryId: CAT, newCategory: null },
    })
  })

  it('reads a new category name when the category is "new"', () => {
    const r = parseEntryForm(form({ amount: '5', name: '', date: '2026-01-05', categoryId: NEW_CATEGORY, newCategory: ' Books ' }), 'expense')
    expect(r).toMatchObject({ ok: true, data: { categoryId: NEW_CATEGORY, newCategory: 'Books' } })
  })

  it('a new category needs a name, at most 30 characters', () => {
    const blank = parseEntryForm(form({ amount: '5', date: '2026-01-05', categoryId: NEW_CATEGORY, newCategory: '  ' }), 'expense')
    expect(blank).toMatchObject({ ok: false, errors: { newCategory: 'Enter a category name.' } })
    const long = parseEntryForm(form({ amount: '5', date: '2026-01-05', categoryId: NEW_CATEGORY, newCategory: 'x'.repeat(31) }), 'expense')
    expect(long).toMatchObject({ ok: false, errors: { newCategory: 'Keep it to 30 characters.' } })
  })

  it('turns a blank name into null', () => {
    const r = parseEntryForm(form({ amount: '5', name: '  ', date: '2026-01-05', categoryId: CAT }), 'expense')
    expect(r.ok && r.data.name).toBeNull()
  })

  it('needs a category for income and expenses, but not for bills or savings', () => {
    const noCategory = form({ amount: '5', name: 'x', date: '2026-01-05' })
    const r = parseEntryForm(noCategory, 'expense')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.errors.categoryId).toBe('Choose a category.')
    expect(parseEntryForm(noCategory, 'bill')).toEqual({ ok: true, data: { amountCents: 500, name: 'x', date: '2026-01-05', categoryId: null, newCategory: null } })
  })

  it('reports every invalid field at once', () => {
    const r = parseEntryForm(form({ amount: '0', name: 'x'.repeat(121), date: '2026-02-30', categoryId: 'nope' }), 'income')
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(Object.keys(r.errors).sort()).toEqual(['amount', 'categoryId', 'date', 'name'])
    expect(r.errors.amount).toBe('Enter an amount like 12.50 (more than 0, up to 2 decimals).')
  })

  it('limits the name to 30 characters', () => {
    const r = parseEntryForm(form({ amount: '5', name: 'x'.repeat(31), date: '2026-01-05', categoryId: CAT }), 'expense')
    expect(!r.ok && r.errors.name).toBe('Keep it to 30 characters.')
    expect(parseEntryForm(form({ amount: '5', name: 'x'.repeat(30), date: '2026-01-05', categoryId: CAT }), 'expense').ok).toBe(true)
  })
})
