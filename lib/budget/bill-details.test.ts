import { describe, expect, it } from 'vitest'
import { billDetails, groupDetails, incomeDetails, savingsDetails } from './bill-details'
import type { Bill, Txn } from './month'

const rent: Bill = {
  id: 'rent',
  groupId: 'housing',
  name: 'Rent',
  dueDay: 1,
  sort: 1,
  versions: [
    { month: '2026-01', amountCents: 100000 },
    { month: '2026-06', amountCents: 110000 },
  ],
}
const payment = (id: string, date: string, cents: number, billId = 'rent'): Txn => ({
  id, date, kind: 'bill', amountCents: cents, name: null, categoryId: null, billId, savingsPlanId: null,
})

describe('groupDetails', () => {
  const data = {
    billGroups: [
      { id: 'subs', name: 'Subscriptions', color: '#b9a8e0', sort: 3 },
      { id: 'housing', name: 'Housing', color: '#f5d76e', sort: 1 },
      { id: 'auto', name: 'Auto', color: '#9ccc9c', sort: 2 },
    ],
    bills: [rent, { ...rent, id: 'old', name: 'Old', versions: [{ month: '2026-01', amountCents: 0 }] }, { ...rent, id: 'gym', groupId: 'auto', name: 'Gym' }],
  }
  // What the Bills card shows this month: Auto's only bill is stopped, so Auto is hidden.
  const shown = [
    { id: 'housing', lines: [{ billId: 'rent', name: 'Rent' }] },
    { id: 'subs', lines: [] },
  ]

  it('lists every group in order with how many bills it has, stopped ones included', () => {
    expect(groupDetails(data, shown).map((g) => [g.name, g.billCount])).toEqual([['Housing', 2], ['Auto', 1], ['Subscriptions', 0]])
  })

  it('says which groups and bills the Bills card shows, in their order', () => {
    expect(groupDetails(data, shown).map((g) => [g.id, g.shown, g.shownBills])).toEqual([
      ['housing', true, [{ id: 'rent', name: 'Rent' }]],
      ['auto', false, []],
      ['subs', true, []],
    ])
  })
})

describe('incomeDetails', () => {
  const edd = {
    id: 'edd', name: 'Unemployment', categoryId: 'unemp', frequency: 'biweekly' as const, startDate: '2026-03-02', endDate: null,
    versions: [{ date: '2026-03-02', amountCents: 45000 }, { date: '2026-11-01', amountCents: 50000 }],
  }

  it('gives the amount per payment around the month and how it repeats', () => {
    expect(incomeDetails({ incomeSources: [edd] }, '2026-10')).toEqual([
      {
        id: 'edd', name: 'Unemployment', categoryId: 'unemp', frequency: 'biweekly', startDate: '2026-03-02', endDate: null,
        planCents: 45000, prevCents: 45000, nextCents: 50000, nextHasOwn: true, payments: [],
      },
    ])
  })

  it('counts nothing before the first payment as 0', () => {
    const [d] = incomeDetails({ incomeSources: [edd] }, '2026-03')
    expect([d.prevCents, d.planCents]).toEqual([0, 45000])
  })
})

describe('savingsDetails', () => {
  it('gives the plan around the month and the transfers made in it', () => {
    const hysa = { id: 'hysa', name: 'HYSA', dayOfMonth: 2, sort: 1, versions: [{ month: '2026-01', amountCents: 50000 }, { month: '2026-03', amountCents: 0 }] }
    const transfer: Txn = { id: 't', date: '2026-02-02', kind: 'saving', amountCents: 45000, name: 'HYSA', categoryId: null, billId: null, savingsPlanId: 'hysa' }
    expect(savingsDetails({ savingsPlans: [hysa], transactions: [transfer] }, '2026-02')).toEqual([
      { id: 'hysa', name: 'HYSA', day: 2, planCents: 50000, prevCents: 50000, nextCents: 0, nextHasOwn: true, payments: [{ id: 't', date: '2026-02-02', cents: 45000 }] },
    ])
  })
})

describe('billDetails', () => {
  it('gives the planned amount for the month and the months around it', () => {
    const [d] = billDetails({ bills: [rent], transactions: [] }, '2026-05')
    expect(d).toEqual({
      id: 'rent', name: 'Rent', groupId: 'housing', dueDay: 1,
      planCents: 100000, prevCents: 100000, nextCents: 110000, nextHasOwn: true, payments: [],
    })
  })

  it('says when the next month just carries the amount on', () => {
    const [d] = billDetails({ bills: [rent], transactions: [] }, '2026-02')
    expect(d.nextCents).toBe(100000)
    expect(d.nextHasOwn).toBe(false)
  })

  it('counts nothing before the first amount as 0', () => {
    const [d] = billDetails({ bills: [rent], transactions: [] }, '2026-01')
    expect(d.prevCents).toBe(0)
  })

  it('lists this bill\'s payments in the month only', () => {
    const [d] = billDetails(
      { bills: [rent], transactions: [payment('a', '2026-05-03', 99000), payment('b', '2026-04-30', 1), payment('c', '2026-05-04', 2, 'gym')] },
      '2026-05',
    )
    expect(d.payments).toEqual([{ id: 'a', date: '2026-05-03', cents: 99000 }])
  })

  it('has no due day when none is set', () => {
    const [d] = billDetails({ bills: [{ ...rent, dueDay: undefined }], transactions: [] }, '2026-05')
    expect(d.dueDay).toBeNull()
  })
})
