import { expect, test } from '@playwright/test'
import { addMonths, formatMonthShort, monthKeyOf, todayInTimeZone } from '../../lib/domain/dates'
import { regularSpec } from '../../lib/payslip/fixtures/workday'
import { admin, assertTestUser, E2E_EMAILS, resetUser, signIn } from './helpers'
import { payslipPdf } from './payslip-pdf'

const header = (month: string) => formatMonthShort(month) // e.g. "Jan 2026"
const CURRENT = monthKeyOf(todayInTimeZone('America/Los_Angeles'))

/** Made-up data: December 2025 has one expense (the earliest data); January has income, bills, savings and expenses; February only bills and savings. */
async function seed(userId: string) {
  await assertTestUser(userId)
  const db = admin()
  const one = async <R extends { data: unknown; error: unknown }>(q: PromiseLike<R>) => {
    const result = await q
    if (result.error) throw result.error
    return result.data as NonNullable<Extract<R, { error: null }>['data']>
  }
  const cats = await one(db.from('categories').select('id, name').eq('user_id', userId))
  const cat = (name: string) => cats.find((c) => c.name === name)!.id
  const groups = await one(db.from('bill_groups').select('id, name').eq('user_id', userId))
  const group = (name: string) => groups.find((g) => g.name === name)!.id

  const rent = await one(db.from('bills').insert({ user_id: userId, group_id: group('Housing'), name: 'Rent', sort: 1 }).select('id').single())
  const music = await one(db.from('bills').insert({ user_id: userId, group_id: group('Subscriptions'), name: 'Music', sort: 2 }).select('id').single())
  await one(db.from('bill_versions').insert([
    { user_id: userId, bill_id: rent.id, effective_month: '2026-01-01', amount: 1200 },
    { user_id: userId, bill_id: music.id, effective_month: '2026-01-01', amount: 10 },
  ]))
  const hysa = await one(db.from('savings_plans').insert({ user_id: userId, name: 'HYSA', day_of_month: 2 }).select('id').single())
  await one(db.from('savings_plan_versions').insert({ user_id: userId, plan_id: hysa.id, effective_month: '2026-01-01', amount: 500 }))
  const row = (date: string, kind: string, amount: number, name: string, category: string) =>
    ({ user_id: userId, date, kind, amount, name, category_id: cat(category) })
  await one(db.from('transactions').insert([
    row('2026-01-15', 'income', 3000, 'Acme pay', 'Salary'),
    row('2026-01-10', 'expense', 40, 'Ramen', 'Dining'),
    row('2026-01-20', 'expense', 25, 'Cafe', 'Dining'),
    row('2026-01-12', 'expense', 60, 'Market', 'Groceries'),
    row('2025-12-20', 'expense', 5, 'Snack', 'Misc'),
  ]))
}

let userId = ''

test.beforeEach(async ({ page }) => {
  userId = await resetUser(E2E_EMAILS.dashboard)
  await signIn(page, E2E_EMAILS.dashboard) // also creates default categories and bill groups
  await seed(userId)
})

test('shows safe to spend and the four cards for a month', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await expect(page.getByRole('heading', { level: 1, name: header('2026-01') })).toBeVisible()
  // 3,000 income − 1,210 bills − 500 savings − 125 expenses
  await expect(page.getByTestId('safe-to-spend')).toHaveText('$1,165')

  await expect(page.getByTestId('income-total')).toHaveText('$3,000')
  await expect(page.getByText('Acme pay')).toBeVisible()
  await expect(page.getByTestId('savings-total')).toHaveText('$500')
  await expect(page.getByTestId('bills-total')).toHaveText('$1,210')
  const current = page.getByTestId('current-month')
  await expect(current.getByText('HOUSING')).toBeVisible()
  await expect(current.getByText('SUBSCRIPTIONS')).toBeVisible()
  await expect(page.getByTestId('expense-total')).toHaveText('$125')
})

test('the savings total includes savings from paychecks, without changing safe to spend', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'biweekly' }).select('id').single()
  const { data: slip } = await db.from('payslips').insert({ user_id: userId, job_id: job!.id, check_date: '2026-01-30', pay_type: 'regular', gross: 2000, net: 1500, parse_method: 'manual' }).select('id').single()
  const { error } = await db.from('payslip_lines').insert({ user_id: userId, payslip_id: slip!.id, label: '401K', kind: 'pretax', tag: 'trad_401k', amount: 200 })
  expect(error).toBeNull()

  await page.goto('/?month=2026-01')
  await expect(page.getByTestId('savings-total')).toHaveText('$700')
  await expect(page.getByTestId('safe-to-spend')).toHaveText('$1,165')
})

test('an expected paycheck opens a read-only note', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const month = addMonths(CURRENT, 2)
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'monthly', first_pay_date: `${month}-15` }).select('id').single()
  const { error } = await db.from('job_pay_entries').insert({ user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 60000 })
  expect(error).toBeNull()

  await page.goto(`/?month=${month}`)
  await page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Acme\)/ }).click()
  const sheet = page.getByRole('dialog', { name: 'Wage (Acme)' })
  await expect(sheet.getByText("Estimated from your job's pay.")).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Save' })).toHaveCount(0)
})

test('a payslip uploaded from an estimated paycheck replaces the estimate (desktop)', async ({ page, isMobile }) => {
  test.skip(isMobile, 'payslip upload is desktop only for now')
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly', first_pay_date: '2026-04-10' }).select('id').single()
  const { error } = await db.from('job_pay_entries').insert({ user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 105560 })
  expect(error).toBeNull()
  const pdf = await payslipPdf(regularSpec) // Example Corp, check date Apr 10, net $2,360

  // Opened from the wrong payday, the review says so
  await page.goto('/?month=2026-04')
  const current = page.getByTestId('current-month')
  await current.getByRole('button', { name: /^Wage \(Example Corp\) · Apr 24/ }).click()
  await page.getByLabel('Upload payslip for Example Corp on Apr 24, 2026').setInputFiles({ name: '04-10-2026.pdf', mimeType: 'application/pdf', buffer: pdf })
  const review = page.getByRole('dialog', { name: 'Review payslip' })
  await expect(review.getByRole('status').first()).toContainText('check date Apr 10, 2026, not Apr 24, 2026')
  await review.getByRole('button', { name: 'Close review' }).click()
  await expect(review).toHaveCount(0)

  // From the right payday: job preset, no warning, and Home shows the real net after saving
  await current.getByRole('button', { name: /^Wage \(Example Corp\) · Apr 10/ }).click()
  await page.getByLabel('Upload payslip for Example Corp on Apr 10, 2026').setInputFiles({ name: '04-10-2026.pdf', mimeType: 'application/pdf', buffer: pdf })
  await expect(review.getByLabel('Job', { exact: true })).toHaveValue(job!.id)
  await expect(review.getByText(/This payslip has/)).toHaveCount(0)
  await review.getByRole('button', { name: 'Save payslip' }).click()
  await expect(review).toHaveCount(0)
  const line = current.getByRole('button', { name: /^Example Corp/ })
  await expect(line).toContainText('Apr 10')
  await expect(line).toContainText('$2,360.00')
  await expect(current.getByRole('button', { name: /^Wage \(Example Corp\) · Apr 10/ })).toHaveCount(0)
})

test('each card explains what it counts, without collapsing', async ({ page }) => {
  await page.goto('/?month=2026-01')
  const current = page.getByTestId('current-month')
  await current.getByRole('button', { name: 'About Income' }).click()
  await expect(page.getByText('Take-home pay only')).toBeVisible()
  await expect(current.getByText('Acme pay')).toBeVisible() // the card stays open
  await page.mouse.click(8, 8)
  await expect(page.getByText('Take-home pay only')).toBeHidden()

  await current.getByRole('button', { name: 'About Bills' }).click()
  await expect(page.getByText('Payments that repeat')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText('Payments that repeat')).toBeHidden()

  await current.getByRole('button', { name: 'About Savings' }).click()
  await expect(page.getByText('Money you set aside')).toBeVisible()
  await current.getByRole('button', { name: 'About Expense' }).click()
  await expect(page.getByText("Everyday spending that isn't a bill")).toBeVisible()
  await expect(page.getByText('Money you set aside')).toBeHidden() // one at a time
})

test('hovering over a card ⓘ shows its note on a laptop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'phones have no hover')
  await page.goto('/?month=2026-01')
  await page.getByTestId('current-month').getByRole('button', { name: 'About Bills' }).hover()
  await expect(page.getByText('Payments that repeat')).toBeVisible()
  await page.mouse.move(5, 5)
  await expect(page.getByText('Payments that repeat')).toBeHidden()
})

test('a link goes back to the current month from any other month', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.getByRole('link', { name: "Back To Today's Month" }).click()
  await expect(page.getByRole('heading', { level: 1, name: header(CURRENT) })).toBeVisible()
  await expect(page.getByRole('link', { name: /^Back to / })).toHaveCount(0)
})

test('a past payday with no payslip keeps its estimate, marked est', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const lastMonth = addMonths(CURRENT, -1)
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'monthly', first_pay_date: `${lastMonth}-15` }).select('id').single()
  const { error } = await db.from('job_pay_entries').insert({ user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 60000 })
  expect(error).toBeNull()

  await page.goto(`/?month=${lastMonth}`)
  const line = page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Acme\)/ })
  await expect(line).toContainText('(est)')
  await expect(line).not.toContainText('(expected)')
  await expect(page.getByTestId('income-total')).toHaveText('$5,000') // 60,000 / 12, nothing withheld in this job
  await line.click()
  await expect(page.getByRole('dialog', { name: 'Wage (Acme)' }).getByText("Estimated from your job's pay.")).toBeVisible()
})

test('a payday can be skipped and unskipped from its note', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const lastMonth = addMonths(CURRENT, -1)
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'monthly', first_pay_date: `${lastMonth}-15` }).select('id').single()
  const { error } = await db.from('job_pay_entries').insert({ user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 60000 })
  expect(error).toBeNull()

  await page.goto(`/?month=${lastMonth}`)
  await page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Acme\)/ }).click()
  await page.getByRole('dialog', { name: 'Wage (Acme)' }).getByRole('button', { name: 'Skip this payday' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Acme\)/ })).toHaveCount(0)
  await expect(page.getByTestId('income-total')).toHaveText('$0')

  // Skipped paydays are listed so they can be undone.
  await page.getByTestId('current-month').getByRole('button', { name: /^Skipped: Wage \(Acme\)/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Unskip' }).click()
  await expect(page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Acme\)/ })).toContainText('(est)')
})

test('safe to spend below zero is red', async ({ page }) => {
  await page.goto('/?month=2026-02')
  const safe = page.getByTestId('safe-to-spend')
  await expect(safe).toHaveText('-$1,710')
  await expect(safe).toHaveAttribute('data-negative', 'true')
})

test('cards start open and fold away', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await expect(page.getByText('Acme pay')).toBeVisible()
  await page.getByRole('button', { name: /^Income/ }).click()
  await expect(page.getByText('Acme pay')).toBeHidden()
  await page.getByRole('button', { name: /^Income/ }).click()
  await expect(page.getByText('Acme pay')).toBeVisible()
})

test('an expense category opens to show its entries, newest first', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await expect(page.getByText('Cafe')).toBeHidden()
  await page.getByRole('button', { name: /^Dining/ }).click()
  const entries = page.getByRole('list', { name: 'Dining entries' }).getByRole('listitem')
  await expect(entries).toHaveCount(2)
  await expect(entries.nth(0)).toContainText('Cafe')
  await expect(entries.nth(1)).toContainText('Ramen')
})

test('prev and next buttons change month, across years', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.getByRole('link', { name: 'Previous month' }).first().click()
  await expect(page).toHaveURL(/month=2025-12/)
  await expect(page.getByRole('heading', { level: 1, name: header('2025-12') })).toBeVisible()
  await page.getByRole('link', { name: 'Next month' }).first().click()
  await expect(page).toHaveURL(/month=2026-01/)
})

test('the calendar jumps to any month', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.getByRole('button', { name: 'Choose month' }).click()
  const picker = page.getByRole('dialog', { name: 'Choose month' })
  await picker.getByRole('button', { name: 'Next year' }).click()
  await picker.getByRole('button', { name: 'Mar', exact: true }).click()
  await expect(page).toHaveURL(/month=2027-03/)
  await expect(page.getByRole('heading', { level: 1, name: header('2027-03') })).toBeVisible()
})

test('you cannot move before the first month with data', async ({ page }) => {
  await page.goto('/?month=2025-12')
  await expect(page.getByRole('heading', { level: 1, name: header('2025-12') })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Previous month' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Previous month' }).first()).toBeDisabled()
  await page.goto('/?month=2025-03')
  await expect(page.getByRole('heading', { level: 1, name: header('2025-12') })).toBeVisible()
})

test('you can look 12 months ahead and no further', async ({ page }) => {
  const last = addMonths(CURRENT, 12)
  await page.goto(`/?month=${last}`)
  await expect(page.getByRole('link', { name: 'Next month' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Next month' }).first()).toBeDisabled()
  await page.goto('/?month=2099-01')
  await expect(page.getByRole('heading', { level: 1, name: header(last) })).toBeVisible()
})

test('the calendar only offers months in range', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.getByRole('button', { name: 'Choose month' }).click()
  const picker = page.getByRole('dialog', { name: 'Choose month' })
  await picker.getByRole('button', { name: 'Previous year' }).click()
  await expect(picker.getByRole('button', { name: 'Nov', exact: true })).toBeDisabled()
  await expect(picker.getByRole('button', { name: 'Dec', exact: true })).toBeEnabled()
  await expect(picker.getByRole('button', { name: 'Previous year' })).toBeDisabled()
})

test('the current month shows days left', async ({ page }) => {
  const now = CURRENT
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: header(now) })).toBeVisible()
  await expect(page.getByText(/days? left/)).toBeVisible()
  await page.goto(`/?month=${addMonths(now, 1)}`)
  await expect(page.getByText(/days? left/)).toHaveCount(0)
})

test('swiping on a phone changes month', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch only')
  await page.goto('/?month=2026-01')
  // A slow drag: start, a few moves, release.
  const swipe = async (dx: number) =>
    page.getByTestId('swipe-area').evaluate(async (el, dx) => {
      const touch = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 })
      const send = (type: string, x: number) =>
        el.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [touch(x)], changedTouches: [touch(x)], bubbles: true }))
      send('touchstart', 200)
      for (const part of [0.25, 0.5, 0.75, 1]) send('touchmove', 200 + dx * part)
      await new Promise((r) => setTimeout(r, 300)) // slower than a flick
      send('touchend', 200 + dx)
    }, dx)
  await swipe(-30) // too short: springs back
  await page.waitForTimeout(400)
  await expect(page).toHaveURL(/month=2026-01/)
  await swipe(-200) // swipe left → next month
  await expect(page).toHaveURL(/month=2026-02/)
  await expect(page.getByRole('heading', { level: 1, name: header('2026-02') })).toBeVisible()
  await swipe(200) // swipe right → previous month
  await expect(page).toHaveURL(/month=2026-01/)
})

test('the arrow keys change month, but not while typing', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('heading', { level: 1, name: header('2026-02') })).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByRole('heading', { level: 1, name: header('2026-01') })).toBeVisible()

  await page.getByRole('button', { name: '＋ Add Expense' }).click()
  await page.getByRole('dialog').getByLabel('Amount').press('ArrowRight')
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/month=2026-01/)
})

test('names stop at 30 characters', async ({ page }) => {
  await page.goto('/?month=2026-01')
  await page.getByRole('button', { name: '＋ Add Expense' }).click()
  const name = page.getByRole('dialog').getByLabel('Name')
  await name.pressSequentially('A very long name for a corner store purchase')
  await expect(name).toHaveValue('A very long name for a corner ')
  await page.mouse.click(8, 8)

  await page.getByRole('button', { name: '＋ Add Bill' }).click()
  const billName = page.getByRole('dialog', { name: 'Add Bill' }).getByLabel('Name')
  await billName.pressSequentially('Streaming service with every add-on')
  await expect(billName).toHaveValue('Streaming service with every a')
})

test('navigation tabs reach Summary and Plan', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('link', { name: 'Summary' }).click()
  await expect(page).toHaveURL(/\/summary$/)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Plan' }).click()
  await expect(page).toHaveURL(/\/plan$/)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test.describe('wide laptop screen', () => {
  test.use({ viewport: { width: 1600, height: 1000 } })

  test('clicking a neighbouring month opens it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'laptop only')
    await page.goto('/?month=2026-01')
    await expect(page.getByTestId('side-safe-2026-02')).toHaveText('-$1,710')
    await page.getByTestId('side-month-2026-02').click()
    await expect(page).toHaveURL(/month=2026-02/)
    await expect(page.getByTestId('safe-to-spend')).toHaveText('-$1,710')
  })
})

test.describe('entries', () => {
  test('adds an expense from the Expense card', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: '＋ Add Expense' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add Expense' })
    await expect(sheet.getByLabel('Date')).toHaveValue('2026-01-01')
    await sheet.getByLabel('Amount').fill('12.50')
    await sheet.getByLabel('Name').fill('Corner store')
    await sheet.getByLabel('Category').selectOption({ label: 'Groceries' })
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Groceries/ })).toContainText('$72.50')
    await page.getByRole('button', { name: /^Groceries/ }).click()
    await expect(page.getByRole('list', { name: 'Groceries entries' })).toContainText('Corner store')
  })

  test('adds an expense in a new category', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: '＋ Add Expense' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add Expense' })
    await sheet.getByLabel('Amount').fill('18')
    await sheet.getByLabel('Name').fill('Paperback')
    await sheet.getByLabel('Category').selectOption({ label: '＋ New category…' })
    await sheet.getByLabel('New category name').fill('Books')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByRole('button', { name: /^Books/ })).toContainText('$18.00')

    // The new category is there to pick next time; a name already used is refused
    await page.getByRole('button', { name: '＋ Add Expense' }).click()
    const again = page.getByRole('dialog', { name: 'Add Expense' })
    await expect(again.getByLabel('Category').getByRole('option', { name: 'Books' })).toHaveCount(1)
    await again.getByLabel('Amount').fill('1')
    await again.getByLabel('Category').selectOption({ label: '＋ New category…' })
    await again.getByLabel('New category name').fill('Salary')
    await again.getByRole('button', { name: 'Save' }).click()
    await expect(again.getByText('You already have a category with this name.')).toBeVisible()
  })

  test('tapping an entry lets you fix its amount', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /Acme pay/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Acme pay' })
    await expect(sheet.getByLabel('Amount')).toHaveValue('3000.00')
    await sheet.getByLabel('Amount').fill('3,100')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$3,100')
  })

  test('removes an entry only after confirming', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /^Dining/ }).click()
    await page.getByRole('list', { name: 'Dining entries' }).getByRole('button', { name: /Cafe/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Cafe' })
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await sheet.getByRole('button', { name: 'Confirm remove' }).click()
    await expect(sheet).toBeHidden()
    // Dining stays open, now with one entry left
    await expect(page.getByRole('list', { name: 'Dining entries' }).getByRole('listitem')).toHaveCount(1)
    await expect(page.getByTestId('expense-total')).toHaveText('$100')
  })

  test('closing the sheet discards changes', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /Acme pay/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Acme pay' })
    await sheet.getByLabel('Amount').fill('9999')
    await sheet.getByRole('button', { name: 'Close' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$3,000')
  })

  test('tapping outside the sheet closes it and discards changes', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /Acme pay/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Acme pay' })
    await sheet.getByLabel('Amount').fill('9999')
    // Tapping inside the sheet keeps it open
    await sheet.getByRole('heading', { name: 'Acme pay' }).click()
    await expect(sheet).toBeVisible()
    // The top-left corner is outside the sheet on both phones (bottom sheet) and laptops (right panel)
    await page.mouse.click(8, 8)
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$3,000')
  })

  test('shows what is wrong and keeps the sheet open', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: '＋ Add Expense' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add Expense' })
    await sheet.getByLabel('Amount').fill('0')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByText('Enter an amount like 12.50 (more than 0, up to 2 decimals).')).toBeVisible()
    await expect(sheet.getByText('Choose a category.')).toBeVisible()
    await expect(sheet).toBeVisible()
  })

  test('an entry from a payslip opens read-only', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: salary } = await db.from('categories').select('id').eq('name', 'Salary').eq('user_id', userId).single()
    const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'biweekly' }).select('id').single()
    const { data: slip } = await db.from('payslips').insert({ user_id: userId, job_id: job!.id, check_date: '2026-01-30', pay_type: 'regular', gross: 2000, net: 1500, parse_method: 'manual' }).select('id').single()
    await db.from('transactions').insert({ user_id: userId, date: '2026-01-30', kind: 'income', amount: 1500, name: 'Acme payslip', category_id: salary!.id, payslip_id: slip!.id, source: 'payslip' })

    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /Acme payslip/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Acme payslip' })
    await expect(sheet.getByText('This entry comes from a payslip')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Save' })).toHaveCount(0)
  })
})

test.describe('bills', () => {
  const openBill = async (page: import('@playwright/test').Page, month: string, name: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByTestId('current-month').getByRole('button', { name: new RegExp(`^${name}`) }).click()
    return page.getByRole('dialog')
  }
  const billsTotal = async (page: import('@playwright/test').Page, month: string, total: string) => {
    await page.goto(`/?month=${month}`)
    await expect(page.getByTestId('bills-total')).toHaveText(total)
  }

  test('changing an amount for just this month leaves the next month alone', async ({ page }) => {
    const sheet = await openBill(page, '2026-01', 'Rent')
    await expect(sheet.getByLabel('Amount')).toHaveValue('1200.00')
    await sheet.getByLabel('Amount').fill('1300')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Only Jan 2026/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,310')
    await billsTotal(page, '2026-02', '$1,210')
  })

  test('changing an amount from this month on leaves earlier months alone', async ({ page }) => {
    const sheet = await openBill(page, '2026-02', 'Rent')
    await sheet.getByLabel('Amount').fill('1250')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Feb 2026 and later/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,260')
    await billsTotal(page, '2026-03', '$1,260')
    await billsTotal(page, '2026-01', '$1,210')
  })

  test('back returns to the form without saving', async ({ page }) => {
    const sheet = await openBill(page, '2026-01', 'Rent')
    await sheet.getByLabel('Amount').fill('1300')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('button', { name: 'Back' }).click()
    await expect(sheet.getByLabel('Amount')).toHaveValue('1300')
    await page.mouse.click(8, 8)
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,210')
  })

  test('removing a bill for one month skips just that month', async ({ page }) => {
    const sheet = await openBill(page, '2026-02', 'Music')
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByRole('heading', { name: 'Remove Music?' })).toBeVisible()
    await sheet.getByRole('radio', { name: /Only Feb 2026/ }).check()
    await sheet.getByRole('button', { name: 'Remove Music' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Music removed for Feb 2026 only')).toBeVisible()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,200')
    await billsTotal(page, '2026-03', '$1,210')
  })

  test('removing a bill for good keeps earlier months', async ({ page }) => {
    const sheet = await openBill(page, '2026-02', 'Music')
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await sheet.getByRole('radio', { name: /Feb 2026 and later/ }).check()
    await sheet.getByRole('button', { name: 'Remove Music' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Music removed from Feb 2026')).toBeVisible()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,200')
    await billsTotal(page, '2026-06', '$1,200')
    await billsTotal(page, '2026-01', '$1,210')
  })

  test('renaming or moving a bill does not ask which months', async ({ page }) => {
    const sheet = await openBill(page, '2026-01', 'Rent')
    await sheet.getByLabel('Name').fill('Apartment')
    await sheet.getByLabel('Group').selectOption({ label: 'Auto' })
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    const current = page.getByTestId('current-month')
    await expect(current.getByRole('button', { name: /^Apartment/ })).toBeVisible()
    await expect(current.getByRole('button', { name: 'Edit group Housing' })).toContainText('$0.00') // now empty
    await expect(page.getByTestId('bills-total')).toHaveText('$1,210')
  })

  test('amount fields take only numbers', async ({ page }) => {
    const sheet = await openBill(page, '2026-01', 'Rent')
    const amount = sheet.getByLabel('Amount')
    await amount.clear()
    await amount.pressSequentially('1a2-.3b4.5')
    await expect(amount).toHaveValue('12.34')
    await page.mouse.click(8, 8)

    await page.getByRole('button', { name: '＋ Add Expense' }).click()
    const expense = page.getByRole('dialog', { name: 'Add Expense' }).getByLabel('Amount')
    await expense.pressSequentially('$4x.5')
    await expect(expense).toHaveValue('4.5')
  })

  test('shows what is wrong and stays on the form', async ({ page }) => {
    const sheet = await openBill(page, '2026-01', 'Rent')
    await sheet.getByLabel('Amount').fill('0')
    await sheet.getByLabel('Due day').fill('40')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByText('Enter an amount like 12.50 (more than 0, up to 2 decimals).')).toBeVisible()
    await expect(sheet.getByText('Enter a day from 1 to 31.')).toBeVisible()
    await expect(sheet.getByRole('radio')).toHaveCount(0)
  })

  test('a bill already paid this month corrects the payment for just this month', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: rent } = await db.from('bills').select('id').eq('user_id', userId).eq('name', 'Rent').single()
    await db.from('transactions').insert({ user_id: userId, date: '2026-01-03', kind: 'bill', amount: 1180, bill_id: rent!.id, source: 'manual' })

    const sheet = await openBill(page, '2026-01', 'Rent')
    await expect(sheet.getByText(/paid Jan 3/)).toBeVisible()
    await expect(sheet.getByLabel('Amount')).toHaveValue('1180.00')
    await sheet.getByLabel('Amount').fill('1195')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Only Jan 2026/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,205')
    await billsTotal(page, '2026-02', '$1,210')
  })

  const addBill = async (page: import('@playwright/test').Page, month: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByRole('button', { name: '＋ Add Bill' }).click()
    return page.getByRole('dialog', { name: 'Add Bill' })
  }

  test('adding a bill starts it in the month you are viewing, at the end of its group', async ({ page }) => {
    const sheet = await addBill(page, '2026-02')
    await expect(sheet.getByRole('radio', { name: /Every month from Feb 2026/ })).toBeChecked()
    await sheet.getByLabel('Amount').fill('15')
    await sheet.getByLabel('Name').fill('Audiobooks')
    await sheet.getByLabel('Group').selectOption({ label: 'Subscriptions' })
    await sheet.getByLabel('Due day').fill('9')
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet).toBeHidden()
    // At the end of its group, after Music
    await expect(page.getByTestId('current-month').getByRole('button', { name: /^(Music|Audiobooks)/ })).toHaveText([/^Music/, /^Audiobooks/])
    await expect(page.getByTestId('bills-total')).toHaveText('$1,225')
    await billsTotal(page, '2026-05', '$1,225')
    await billsTotal(page, '2026-01', '$1,210')
  })

  test('a one-time bill shows in that month only', async ({ page }) => {
    const sheet = await addBill(page, '2026-02')
    await sheet.getByLabel('Amount').fill('250')
    await sheet.getByLabel('Name').fill('Repair')
    await sheet.getByRole('radio', { name: /One time/ }).check()
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,460')
    await billsTotal(page, '2026-03', '$1,210')
    await billsTotal(page, '2026-01', '$1,210')

    const again = await addBill(page, '2026-04')
    await again.getByLabel('Amount').fill('100')
    await again.getByLabel('Name').fill('Repair')
    await again.getByRole('radio', { name: /One time/ }).check()
    await again.getByRole('button', { name: 'Add Bill' }).click()
    await expect(page.getByText('Repair added for Apr 2026')).toBeVisible()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,310')
    await billsTotal(page, '2026-05', '$1,210')
    await billsTotal(page, '2026-02', '$1,460')
  })

  test('adding a removed bill by name restarts it', async ({ page }) => {
    await assertTestUser(userId)
    const { data: music } = await admin().from('bills').select('id').eq('user_id', userId).eq('name', 'Music').single()
    const { error } = await admin().from('bill_versions').insert({ user_id: userId, bill_id: music!.id, effective_month: '2026-03-01', amount: 0 })
    expect(error).toBeNull()

    const sheet = await addBill(page, '2026-05')
    await sheet.getByLabel('Amount').fill('12')
    await sheet.getByLabel('Name').fill('Music')
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Music restarted from May 2026')).toBeVisible()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,212')
    await billsTotal(page, '2026-04', '$1,200')
    await billsTotal(page, '2026-02', '$1,210')
  })

  test('a bill still running that month cannot be added again', async ({ page }) => {
    const sheet = await addBill(page, '2026-02')
    await sheet.getByLabel('Amount').fill('5')
    await sheet.getByLabel('Name').fill('Rent')
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet.getByText('You already have a bill with this name.')).toBeVisible()
    await page.mouse.click(8, 8)
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('bills-total')).toHaveText('$1,210')
  })

  test('adding a bill shows what is missing', async ({ page }) => {
    const sheet = await addBill(page, '2026-02')
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet.getByText('Enter an amount like 12.50 (more than 0, up to 2 decimals).')).toBeVisible()
    await expect(sheet.getByText('Enter a name.')).toBeVisible()
    await expect(sheet).toBeVisible()
  })
})

test.describe('bill groups', () => {
  const openGroup = async (page: import('@playwright/test').Page, month: string, name: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByTestId('current-month').getByRole('button', { name: `Edit group ${name}` }).click()
    return page.getByRole('dialog', { name })
  }

  test('renaming and recoloring a group', async ({ page }) => {
    const sheet = await openGroup(page, '2026-01', 'Housing')
    await expect(sheet.getByText('Group · 1 bill')).toBeVisible()
    await sheet.getByLabel('Name').fill('Home')
    await sheet.getByRole('radio', { name: 'Blue' }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    const again = await openGroup(page, '2026-02', 'Home')
    await expect(again.getByRole('radio', { name: 'Blue' })).toBeChecked()
  })

  test('a group name must be unique', async ({ page }) => {
    const sheet = await openGroup(page, '2026-01', 'Housing')
    await sheet.getByLabel('Name').fill('Subscriptions')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByText('You already have a group with this name.')).toBeVisible()
  })

  test('only an empty group can be deleted', async ({ page }) => {
    const housing = await openGroup(page, '2026-01', 'Housing')
    await expect(housing.getByRole('button', { name: 'Delete group' })).toBeDisabled()
    await expect(housing.getByText('Only an empty group can be deleted.')).toBeVisible()
    await page.mouse.click(8, 8)

    const auto = await openGroup(page, '2026-01', 'Auto')
    await expect(auto.getByText('Group · 0 bills')).toBeVisible()
    await auto.getByRole('button', { name: 'Delete group' }).click()
    await expect(auto).toBeHidden()
    await expect(page.getByText('Auto deleted')).toBeVisible()
    await expect(page.getByTestId('current-month').getByRole('button', { name: 'Edit group Auto' })).toHaveCount(0)
  })

  test('adding a bill into a new group', async ({ page }) => {
    await page.goto('/?month=2026-02')
    await page.getByRole('button', { name: '＋ Add Bill' }).click()
    const sheet = page.getByRole('dialog', { name: 'Add Bill' })
    await sheet.getByLabel('Amount').fill('20')
    await sheet.getByLabel('Name').fill('Yoga')
    await sheet.getByLabel('Group', { exact: true }).selectOption({ label: '＋ New group…' })
    await sheet.getByLabel('New group name').fill('Fitness')
    await sheet.getByRole('button', { name: 'Add Bill' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('current-month').getByRole('button', { name: 'Edit group Fitness' })).toContainText('$20.00')
  })

  test('moving a bill into a new group', async ({ page }) => {
    await page.goto('/?month=2026-01')
    await page.getByTestId('current-month').getByRole('button', { name: /^Rent/ }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('Group', { exact: true }).selectOption({ label: '＋ New group…' })
    await sheet.getByLabel('New group name').fill('Home')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('current-month').getByRole('button', { name: 'Edit group Home' })).toContainText('$1,200.00')
  })

  const groupOrder = (page: import('@playwright/test').Page) =>
    page.getByTestId('current-month').getByRole('button', { name: /^Edit group / }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))

  test('moving a bill up in its group', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: housing } = await db.from('bill_groups').select('id').eq('user_id', userId).eq('name', 'Housing').single()
    const { data: internet } = await db.from('bills').insert({ user_id: userId, group_id: housing!.id, name: 'Internet', sort: 2 }).select('id').single()
    const { error } = await db.from('bill_versions').insert({ user_id: userId, bill_id: internet!.id, effective_month: '2026-01-01', amount: 60 })
    expect(error).toBeNull()

    const sheet = await openGroup(page, '2026-01', 'Housing')
    await expect(sheet.getByRole('button', { name: 'Move Rent up' })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Move Internet down' })).toBeDisabled()
    await sheet.getByRole('button', { name: 'Move Internet up' }).click()
    await expect(sheet.getByRole('button', { name: 'Move Internet up' })).toBeDisabled()
    const bills = page.getByTestId('current-month').getByRole('button', { name: /^(Rent|Internet)/ })
    await expect(bills).toHaveText([/^Internet/, /^Rent/])

    await page.reload()
    await expect(bills).toHaveText([/^Internet/, /^Rent/])
  })

  test('moving a group down', async ({ page }) => {
    const sheet = await openGroup(page, '2026-01', 'Housing')
    await expect(sheet.getByText('Group position · 1st of 3')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Move group up' })).toBeDisabled()
    await sheet.getByRole('button', { name: 'Move group down' }).click()
    await expect(sheet.getByText('Group position · 2nd of 3')).toBeVisible()
    await expect.poll(() => groupOrder(page)).toEqual(['Edit group Auto', 'Edit group Housing', 'Edit group Subscriptions'])

    await page.reload()
    await expect.poll(() => groupOrder(page)).toEqual(['Edit group Auto', 'Edit group Housing', 'Edit group Subscriptions'])
  })

  test('a group with one bill has no order list', async ({ page }) => {
    const sheet = await openGroup(page, '2026-01', 'Subscriptions')
    await expect(sheet.getByText('Group position · 3rd of 3')).toBeVisible()
    await expect(sheet.getByText('Order')).toHaveCount(0)
    await expect(sheet.getByRole('button', { name: 'Move group down' })).toBeDisabled()
  })
})

test.describe('savings plans', () => {
  const openSaving = async (page: import('@playwright/test').Page, month: string, name: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByTestId('current-month').getByRole('button', { name: new RegExp(`^${name}`) }).click()
    return page.getByRole('dialog')
  }
  const savingsTotal = async (page: import('@playwright/test').Page, month: string, total: string) => {
    await page.goto(`/?month=${month}`)
    await expect(page.getByTestId('savings-total')).toHaveText(total)
  }

  test('changing a saving for just this month', async ({ page }) => {
    const sheet = await openSaving(page, '2026-01', 'HYSA')
    await expect(sheet.getByLabel('Amount')).toHaveValue('500.00')
    await expect(sheet.getByLabel('Day')).toHaveValue('2')
    await sheet.getByLabel('Amount').fill('300')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Only Jan 2026/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('savings-total')).toHaveText('$300')
    await savingsTotal(page, '2026-02', '$500')
  })

  test('changing a saving from this month on', async ({ page }) => {
    const sheet = await openSaving(page, '2026-02', 'HYSA')
    await sheet.getByLabel('Amount').fill('600')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Feb 2026 and later/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await savingsTotal(page, '2026-06', '$600')
    await savingsTotal(page, '2026-01', '$500')
  })

  test('removing a saving from this month on', async ({ page }) => {
    const sheet = await openSaving(page, '2026-02', 'HYSA')
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await sheet.getByRole('radio', { name: /Feb 2026 and later/ }).check()
    await sheet.getByRole('button', { name: 'Remove HYSA' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('HYSA removed from Feb 2026')).toBeVisible()
    await expect(page.getByTestId('savings-total')).toHaveText('$0')
    await savingsTotal(page, '2026-01', '$500')
  })

  test('renaming a saving or changing its day does not ask which months', async ({ page }) => {
    const sheet = await openSaving(page, '2026-01', 'HYSA')
    await sheet.getByLabel('Name').fill('Emergency fund')
    await sheet.getByLabel('Day').fill('15')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    const again = await openSaving(page, '2026-03', 'Emergency fund')
    await expect(again.getByLabel('Day')).toHaveValue('15')
  })

  test('a transfer already made this month is corrected', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: plan } = await db.from('savings_plans').select('id').eq('user_id', userId).eq('name', 'HYSA').single()
    const { error } = await db.from('transactions').insert({ user_id: userId, date: '2026-01-02', kind: 'saving', amount: 450, name: 'HYSA', savings_plan_id: plan!.id })
    expect(error).toBeNull()

    const sheet = await openSaving(page, '2026-01', 'HYSA')
    await expect(sheet.getByLabel('Amount')).toHaveValue('450.00')
    await sheet.getByLabel('Amount').fill('480')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Only Jan 2026/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('savings-total')).toHaveText('$480')
    await savingsTotal(page, '2026-02', '$500')
  })

  test('employer 401(k) match and HSA from a payslip show in Savings', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'biweekly' }).select('id').single()
    const { data: slip } = await db.from('payslips').insert({ user_id: userId, job_id: job!.id, check_date: '2026-01-30', pay_type: 'regular', gross: 2000, net: 1500, parse_method: 'manual' }).select('id').single()
    const { error } = await db.from('payslip_lines').insert([
      { user_id: userId, payslip_id: slip!.id, label: '401k Match', kind: 'employer', tag: '401k_match', amount: 80 },
      { user_id: userId, payslip_id: slip!.id, label: 'HSA ER Contribution', kind: 'employer', tag: 'hsa_match', amount: 20 },
    ])
    expect(error).toBeNull()

    await page.goto('/?month=2026-01')
    await expect(page.getByRole('button', { name: /^401\(k\) Employer match/ })).toContainText('$80.00')
    await expect(page.getByRole('button', { name: /^HSA Employer match/ })).toContainText('$20.00')
    await expect(page.getByTestId('savings-total')).toHaveText('$600') // HYSA 500 + 80 + 20
  })

  test('a saving from a paycheck opens read-only', async ({ page }) => {
    await assertTestUser(userId)
    const db = admin()
    const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Acme', pay_frequency: 'biweekly' }).select('id').single()
    const { data: slip } = await db.from('payslips').insert({ user_id: userId, job_id: job!.id, check_date: '2026-01-30', pay_type: 'regular', gross: 2000, net: 1500, parse_method: 'manual' }).select('id').single()
    const { error } = await db.from('payslip_lines').insert({ user_id: userId, payslip_id: slip!.id, label: '401K', kind: 'pretax', tag: 'trad_401k', amount: 200 })
    expect(error).toBeNull()

    await page.goto('/?month=2026-01')
    await page.getByRole('button', { name: /^401\(k\) Traditional/ }).click()
    const sheet = page.getByRole('dialog', { name: '401(k) Traditional' })
    await expect(sheet.getByText('This comes from your paycheck.')).toBeVisible()
    await expect(sheet.getByRole('button', { name: 'Save' })).toHaveCount(0)
  })

  const addSaving = async (page: import('@playwright/test').Page, month: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByRole('button', { name: '＋ Add Saving' }).click()
    return page.getByRole('dialog', { name: 'Add Saving' })
  }

  test('adding a saving starts it in the month you are viewing, at the end', async ({ page }) => {
    const sheet = await addSaving(page, '2026-02')
    await expect(sheet.getByRole('radio', { name: /Every month from Feb 2026/ })).toBeChecked()
    await sheet.getByLabel('Amount').fill('200')
    await sheet.getByLabel('Name').fill('Trip')
    await sheet.getByLabel('Day').fill('10')
    await sheet.getByRole('button', { name: 'Add Saving' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('current-month').getByRole('button', { name: /^(HYSA|Trip)/ })).toHaveText([/^HYSA/, /^Trip/])
    await expect(page.getByTestId('savings-total')).toHaveText('$700')
    await savingsTotal(page, '2026-05', '$700')
    await savingsTotal(page, '2026-01', '$500')
  })

  test('a one-time saving shows in that month only', async ({ page }) => {
    const sheet = await addSaving(page, '2026-02')
    await sheet.getByLabel('Amount').fill('100')
    await sheet.getByLabel('Name').fill('Gift')
    await sheet.getByRole('radio', { name: /One time/ }).check()
    await sheet.getByRole('button', { name: 'Add Saving' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('savings-total')).toHaveText('$600')
    await savingsTotal(page, '2026-03', '$500')
  })

  test('adding a removed saving by name restarts it', async ({ page }) => {
    await assertTestUser(userId)
    const { data: plan } = await admin().from('savings_plans').select('id').eq('user_id', userId).eq('name', 'HYSA').single()
    const { error } = await admin().from('savings_plan_versions').insert({ user_id: userId, plan_id: plan!.id, effective_month: '2026-03-01', amount: 0 })
    expect(error).toBeNull()

    const sheet = await addSaving(page, '2026-05')
    await sheet.getByLabel('Amount').fill('450')
    await sheet.getByLabel('Name').fill('HYSA')
    await sheet.getByRole('button', { name: 'Add Saving' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('HYSA restarted from May 2026')).toBeVisible()
    await expect(page.getByTestId('savings-total')).toHaveText('$450')
    await savingsTotal(page, '2026-04', '$0')
    await savingsTotal(page, '2026-02', '$500')
  })

  test('a saving still running that month cannot be added again', async ({ page }) => {
    const sheet = await addSaving(page, '2026-02')
    await sheet.getByLabel('Amount').fill('5')
    await sheet.getByLabel('Name').fill('HYSA')
    await sheet.getByRole('button', { name: 'Add Saving' }).click()
    await expect(sheet.getByText('You already have a savings plan with this name.')).toBeVisible()
  })

  test('adding a saving shows what is missing', async ({ page }) => {
    const sheet = await addSaving(page, '2026-02')
    await sheet.getByLabel('Day').fill('40')
    await sheet.getByRole('button', { name: 'Add Saving' }).click()
    await expect(sheet.getByText('Enter an amount like 12.50 (more than 0, up to 2 decimals).')).toBeVisible()
    await expect(sheet.getByText('Enter a name.')).toBeVisible()
    await expect(sheet.getByText('Enter a day from 1 to 31.')).toBeVisible()
  })
})

test.describe('other income', () => {
  // Every 2 weeks from Feb 6, 2026: two payments in Feb and in Mar.
  test.beforeEach(async () => {
    await assertTestUser(userId)
    const db = admin()
    const { data: category } = await db.from('categories').select('id').eq('user_id', userId).eq('name', 'Unemployment').single()
    const { data: source } = await db
      .from('income_sources')
      .insert({ user_id: userId, name: 'Unemployment', category_id: category!.id, frequency: 'biweekly', start_date: '2026-02-06' })
      .select('id')
      .single()
    const { error } = await db.from('income_source_versions').insert({ user_id: userId, source_id: source!.id, effective_date: '2026-02-06', amount: 450 })
    expect(error).toBeNull()
  })
  const openIncome = async (page: import('@playwright/test').Page, month: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByTestId('current-month').getByRole('button', { name: /^Unemployment/ }).first().click()
    return page.getByRole('dialog')
  }
  const incomeTotal = async (page: import('@playwright/test').Page, month: string, total: string) => {
    await page.goto(`/?month=${month}`)
    await expect(page.getByTestId('income-total')).toHaveText(total)
  }

  test('removing just one payment skips that date only; it can be put back', async ({ page }) => {
    await page.goto('/?month=2026-02')
    const current = page.getByTestId('current-month')
    await expect(page.getByTestId('income-total')).toHaveText('$900')
    await current.getByRole('button', { name: /^Unemployment · Feb 20/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Unemployment' })
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await expect(sheet.getByRole('radio', { name: /Just this payment/ })).toBeChecked()
    await sheet.getByRole('button', { name: 'Remove this payment' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Payment on Feb 20, 2026 skipped')).toBeVisible()
    await expect(page.getByTestId('income-total')).toHaveText('$450')
    const skipped = current.getByRole('button', { name: /^Skipped: Unemployment · Feb 20/ })
    await expect(skipped).toBeVisible()
    await expect(current.getByRole('button', { name: /^Unemployment · Feb 6/ })).toBeVisible() // the other payment stays
    await incomeTotal(page, '2026-03', '$900') // other months untouched

    await page.goto('/?month=2026-02')
    await skipped.click()
    await page.getByRole('dialog', { name: 'Unemployment' }).getByRole('button', { name: 'Unskip this payment' }).click()
    await expect(page.getByTestId('income-total')).toHaveText('$900')
  })

  test('changing only one payment records it for the new amount; the plan stays', async ({ page }) => {
    await page.goto('/?month=2026-02')
    const current = page.getByTestId('current-month')
    await current.getByRole('button', { name: /^Unemployment · Feb 20/ }).click()
    const sheet = page.getByRole('dialog') // its title changes with the step
    await expect(sheet.getByLabel('Amount per payment')).toHaveValue('450.00')
    await expect(sheet.getByLabel('Category')).toHaveValue(/./) // the category shows
    await sheet.getByLabel('Amount per payment').fill('500')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /Only this payment/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$950')
    await expect(current.getByRole('button', { name: /^Unemployment · Feb 20/ })).toContainText('$500.00')
    await incomeTotal(page, '2026-03', '$900')
    // It is a recorded entry now, so it opens the entry sheet
    await page.goto('/?month=2026-02')
    await current.getByRole('button', { name: /^Unemployment · Feb 20/ }).click()
    await expect(page.getByRole('dialog').getByLabel('Amount')).toHaveValue('500.00')
  })

  test('changing this and later payments', async ({ page }) => {
    await page.goto('/?month=2026-03')
    await page.getByTestId('current-month').getByRole('button', { name: /^Unemployment · Mar 20/ }).click()
    const sheet = page.getByRole('dialog') // its title changes with the step
    await sheet.getByLabel('Amount per payment').fill('500')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByRole('radio', { name: /This and later payments/ })).toBeChecked()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$950') // Mar 6 stays 450, Mar 20 is 500
    await incomeTotal(page, '2026-04', '$1,000')
    await incomeTotal(page, '2026-02', '$900')
  })

  test('changing all payments', async ({ page }) => {
    const sheet = await openIncome(page, '2026-03')
    await sheet.getByLabel('Amount per payment').fill('500')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await sheet.getByRole('radio', { name: /All payments/ }).check()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await incomeTotal(page, '2026-02', '$1,000')
    await incomeTotal(page, '2026-04', '$1,000')
  })

  test('removing this and later payments ends the income the day before', async ({ page }) => {
    await page.goto('/?month=2026-03')
    await page.getByTestId('current-month').getByRole('button', { name: /^Unemployment · Mar 20/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Unemployment' })
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await sheet.getByRole('radio', { name: /This and later payments/ }).check()
    await sheet.getByRole('button', { name: 'Remove Unemployment' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Unemployment removed from Mar 20, 2026')).toBeVisible()
    await expect(page.getByTestId('income-total')).toHaveText('$450')
    await incomeTotal(page, '2026-04', '$0')
    await incomeTotal(page, '2026-02', '$900')
  })

  test('removing all payments deletes the income', async ({ page }) => {
    const sheet = await openIncome(page, '2026-03')
    await sheet.getByRole('button', { name: 'Remove' }).click()
    await sheet.getByRole('radio', { name: /All payments/ }).check()
    await sheet.getByRole('button', { name: 'Remove Unemployment' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Unemployment removed')).toBeVisible()
    await incomeTotal(page, '2026-02', '$0')
  })

  test('changing the category applies to every payment', async ({ page }) => {
    const sheet = await openIncome(page, '2026-02')
    await sheet.getByLabel('Category').selectOption({ label: 'Side income' })
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    const again = await openIncome(page, '2026-03')
    const sideIncome = (await again.getByLabel('Category').locator('option', { hasText: 'Side income' }).getAttribute('value')) ?? ''
    await expect(again.getByLabel('Category')).toHaveValue(sideIncome)
  })

  test('changing how often or when it ends does not ask which months', async ({ page }) => {
    const sheet = await openIncome(page, '2026-02')
    await sheet.getByLabel('How often').selectOption({ label: 'Monthly' })
    await sheet.getByLabel('Ends').fill('2026-03-31')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$450')
    await incomeTotal(page, '2026-04', '$0')
  })

  test('an end date before the start is refused', async ({ page }) => {
    const sheet = await openIncome(page, '2026-02')
    await sheet.getByLabel('Ends').fill('2026-01-01')
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByText('End on or after Feb 6, 2026.')).toBeVisible()
  })
})

test.describe('adding income', () => {
  const addIncome = async (page: import('@playwright/test').Page, month: string) => {
    await page.goto(`/?month=${month}`)
    await page.getByRole('button', { name: '＋ Add Income' }).click()
    return page.getByRole('dialog', { name: 'Add Income' })
  }
  const incomeTotal = async (page: import('@playwright/test').Page, month: string, total: string) => {
    await page.goto(`/?month=${month}`)
    await expect(page.getByTestId('income-total')).toHaveText(total)
  }

  test('one-time income shows on its date only', async ({ page }) => {
    const sheet = await addIncome(page, '2026-02')
    await expect(sheet.getByLabel('Category')).toHaveValue(/.+/)
    await sheet.getByLabel('Amount').fill('1200')
    await sheet.getByLabel('Name').fill('Freelance')
    await sheet.getByLabel('Date').fill('2026-02-10')
    await sheet.getByRole('button', { name: 'Add Income' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('current-month').getByRole('button', { name: /^Freelance/ })).toBeVisible()
    await expect(page.getByTestId('income-total')).toHaveText('$1,200')
    await incomeTotal(page, '2026-03', '$0')
  })

  test('repeating income starts on its first payment', async ({ page }) => {
    const sheet = await addIncome(page, '2026-02')
    await sheet.getByLabel('Amount').fill('300')
    await sheet.getByLabel('Name').fill('Tutoring')
    await sheet.getByLabel('How often').selectOption({ label: 'Monthly' })
    await sheet.getByLabel('First payment').fill('2026-02-05')
    await sheet.getByRole('button', { name: 'Add Income' }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByTestId('income-total')).toHaveText('$300')
    await incomeTotal(page, '2026-05', '$300')
    await incomeTotal(page, '2026-01', '$3,000')
  })

  test('adding income shows what is missing', async ({ page }) => {
    const sheet = await addIncome(page, '2026-02')
    await sheet.getByRole('button', { name: 'Add Income' }).click()
    await expect(sheet.getByText('Enter an amount like 12.50 (more than 0, up to 2 decimals).')).toBeVisible()
    await expect(sheet.getByText('Enter a name.')).toBeVisible()
  })
})
