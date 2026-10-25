import { describe, expect, it } from 'vitest'
import { AMOUNT_ERROR } from './entry-input'
import { GROUP_COLORS, nextGroupColor, parseAddIncomeForm, parseBillForm, parseGroupForm, parseIncomeForm, parseIncomeScope, parseSavingsForm, parseScope } from './plan-input'

const GROUP = '3f1c2b9e-8d4a-4c6b-9e2f-1a2b3c4d5e6f'

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('parseBillForm', () => {
  it('reads a bill', () => {
    expect(parseBillForm(form({ amount: '2,150', name: ' Rent ', groupId: GROUP, dueDay: '1' }))).toEqual({
      ok: true,
      data: { amountCents: 215000, name: 'Rent', groupId: GROUP, newGroup: null, dueDay: 1 },
    })
  })

  it('reads a new group by name', () => {
    const r = parseBillForm(form({ amount: '10', name: 'Yoga', groupId: 'new', newGroup: ' Fitness ', dueDay: '' }))
    expect(r.ok && [r.data.groupId, r.data.newGroup]).toEqual(['new', 'Fitness'])
  })

  it('needs a name for a new group', () => {
    const r = parseBillForm(form({ amount: '10', name: 'Yoga', groupId: 'new', newGroup: ' ', dueDay: '' }))
    expect(!r.ok && r.errors).toEqual({ newGroup: 'Enter a group name.' })
    const long = parseBillForm(form({ amount: '10', name: 'Yoga', groupId: 'new', newGroup: 'x'.repeat(31), dueDay: '' }))
    expect(!long.ok && long.errors.newGroup).toBe('Keep it to 30 characters.')
  })

  it('treats a blank due day as none', () => {
    const r = parseBillForm(form({ amount: '10', name: 'Music', groupId: GROUP, dueDay: ' ' }))
    expect(r.ok && r.data.dueDay).toBeNull()
  })

  it('reports every problem at once', () => {
    expect(parseBillForm(form({ amount: '0', name: '  ', groupId: 'nope', dueDay: '32' }))).toEqual({
      ok: false,
      errors: { amount: AMOUNT_ERROR, name: 'Enter a name.', groupId: 'Choose a group.', dueDay: 'Enter a day from 1 to 31.' },
    })
  })

  it('rejects a due day that is not a whole number', () => {
    const r = parseBillForm(form({ amount: '10', name: 'Music', groupId: GROUP, dueDay: '1.5' }))
    expect(!r.ok && r.errors.dueDay).toBe('Enter a day from 1 to 31.')
  })

  it('limits the name to 30 characters', () => {
    const r = parseBillForm(form({ amount: '10', name: 'x'.repeat(31), groupId: GROUP, dueDay: '' }))
    expect(!r.ok && r.errors.name).toBe('Keep it to 30 characters.')
    expect(parseBillForm(form({ amount: '10', name: 'x'.repeat(30), groupId: GROUP, dueDay: '' })).ok).toBe(true)
  })
})

describe('parseSavingsForm', () => {
  it('reads a savings plan', () => {
    expect(parseSavingsForm(form({ amount: '500', name: ' HYSA ', day: '2' }))).toEqual({ ok: true, data: { amountCents: 50000, name: 'HYSA', day: 2 } })
  })

  it('treats a blank day as none', () => {
    const r = parseSavingsForm(form({ amount: '5', name: 'Trip', day: '' }))
    expect(r.ok && r.data.day).toBeNull()
  })

  it('reports every problem at once', () => {
    expect(parseSavingsForm(form({ amount: '', name: '', day: '0' }))).toEqual({
      ok: false,
      errors: { amount: AMOUNT_ERROR, name: 'Enter a name.', day: 'Enter a day from 1 to 31.' },
    })
  })
})

describe('parseIncomeForm', () => {
  const CATEGORY = '9b2f3c1d-4e5a-4b6c-8d7e-0f1a2b3c4d5e'

  it('reads income', () => {
    expect(parseIncomeForm(form({ amount: '450', name: ' Unemployment ', frequency: 'biweekly', endDate: '2026-12-31', startDate: '2026-03-02', categoryId: CATEGORY }))).toEqual({
      ok: true,
      data: { amountCents: 45000, name: 'Unemployment', frequency: 'biweekly', endDate: '2026-12-31', categoryId: CATEGORY },
    })
  })

  it('treats a blank end date as none', () => {
    const r = parseIncomeForm(form({ amount: '450', name: 'Side gig', frequency: 'once', endDate: '', startDate: '2026-03-02', categoryId: CATEGORY }))
    expect(r.ok && r.data.endDate).toBeNull()
  })

  it('reports every problem at once', () => {
    expect(parseIncomeForm(form({ amount: '', name: '', frequency: 'yearly', endDate: '2026-02-01', startDate: '2026-03-02', categoryId: '' }))).toEqual({
      ok: false,
      errors: { amount: AMOUNT_ERROR, name: 'Enter a name.', frequency: 'Choose how often.', endDate: 'End on or after Mar 2, 2026.', categoryId: 'Choose a category.' },
    })
  })

  it('rejects a date that does not exist', () => {
    const r = parseIncomeForm(form({ amount: '1', name: 'X', frequency: 'monthly', endDate: '2026-02-30', startDate: '2026-01-01', categoryId: CATEGORY }))
    expect(!r.ok && r.errors.endDate).toBe('Enter a date.')
  })

  it('knows the three ways a change can apply to payments', () => {
    expect(['one', 'all', 'later'].map(parseIncomeScope)).toEqual(['one', 'all', 'later'])
    expect(parseIncomeScope('month')).toBeNull()
    expect(parseIncomeScope(null)).toBeNull()
  })
})

describe('parseAddIncomeForm', () => {
  const CATEGORY = '9b2f3c1d-4e5a-4b6c-8d7e-0f1a2b3c4d5e'

  it('reads new income', () => {
    expect(parseAddIncomeForm(form({ amount: '1,200', name: ' Freelance ', frequency: 'once', date: '2026-10-28', categoryId: CATEGORY }))).toEqual({
      ok: true,
      data: { amountCents: 120000, name: 'Freelance', frequency: 'once', date: '2026-10-28', categoryId: CATEGORY },
    })
  })

  it('reports every problem at once', () => {
    expect(parseAddIncomeForm(form({ amount: '0', name: '', frequency: 'daily', date: '2026-02-30', categoryId: 'x' }))).toEqual({
      ok: false,
      errors: { amount: AMOUNT_ERROR, name: 'Enter a name.', frequency: 'Choose how often.', date: 'Enter a date.', categoryId: 'Choose a category.' },
    })
  })
})

describe('parseGroupForm', () => {
  it('reads a name and a color', () => {
    expect(parseGroupForm(form({ name: ' Home ', color: '#8FB8E8' }))).toEqual({ ok: true, data: { name: 'Home', color: '#8fb8e8' } })
  })

  it('reports a missing name and a bad color', () => {
    expect(parseGroupForm(form({ name: '', color: 'blue' }))).toEqual({ ok: false, errors: { name: 'Enter a name.', color: 'Choose a color.' } })
  })
})

describe('nextGroupColor', () => {
  it('picks the first color no group uses yet', () => {
    expect(nextGroupColor([GROUP_COLORS[0].hex.toUpperCase(), GROUP_COLORS[2].hex])).toBe(GROUP_COLORS[1].hex)
  })

  it('goes round again when every color is used', () => {
    // 8 colors, 9 groups: the 10th group gets the 2nd color
    expect(nextGroupColor([...GROUP_COLORS.map((c) => c.hex), '#123456'])).toBe(GROUP_COLORS[1].hex)
  })
})

describe('parseScope', () => {
  it('reads just this month or this month and later', () => {
    expect(parseScope('month')).toBe('month')
    expect(parseScope('later')).toBe('later')
  })

  it('returns null for anything else', () => {
    expect(parseScope(null)).toBeNull()
    expect(parseScope('')).toBeNull()
    expect(parseScope('always')).toBeNull()
  })
})
