import { expect, test } from '@playwright/test'
import { addMonths, formatMonthShort, monthKeyOf, todayInTimeZone } from '../../lib/domain/dates'
import { admin, assertTestUser, E2E_EMAILS, resetUser, signIn } from './helpers'

const CURRENT = monthKeyOf(todayInTimeZone('America/Los_Angeles'))
const YEAR = Number(CURRENT.slice(0, 4))
const MONTH = Number(CURRENT.slice(5, 7)) // 1–12

/** Made-up data: a $1,000 bill and $1,500 monthly income from two months ago, so each month is +$500. */
async function seed(userId: string) {
  await assertTestUser(userId)
  const db = admin()
  const start = addMonths(CURRENT, -2)
  const { data: group } = await db.from('bill_groups').select('id').eq('user_id', userId).eq('name', 'Housing').single()
  const { data: rent } = await db.from('bills').insert({ user_id: userId, group_id: group!.id, name: 'Rent' }).select('id').single()
  await db.from('bill_versions').insert({ user_id: userId, bill_id: rent!.id, effective_month: `${start}-01`, amount: 1000 })
  const { data: category } = await db.from('categories').select('id').eq('user_id', userId).eq('name', 'Unemployment').single()
  const { data: source } = await db
    .from('income_sources')
    .insert({ user_id: userId, name: 'Unemployment', category_id: category!.id, frequency: 'monthly', start_date: `${start}-01` })
    .select('id')
    .single()
  const { error } = await db.from('income_source_versions').insert({ user_id: userId, source_id: source!.id, effective_date: `${start}-01`, amount: 1500 })
  expect(error).toBeNull()
}

let userId = ''

test.beforeEach(async ({ page }) => {
  userId = await resetUser(E2E_EMAILS.dashboard)
  await signIn(page, E2E_EMAILS.dashboard)
})

test('shows the current year with a cell per month and the year total', async ({ page }) => {
  test.skip(MONTH < 3, 'the seed needs two past months in this year')
  await seed(userId)
  await page.goto('/summary')
  await expect(page.getByRole('heading', { level: 1, name: 'Summary' })).toBeVisible()
  await expect(page.getByTestId('year')).toHaveText(String(YEAR))
  // Two past months and now count; this year's months before the data show —.
  const cells = page.getByTestId(/^month-/)
  await expect(cells).toHaveCount(12)
  await expect(page.getByTestId(`month-${addMonths(CURRENT, -1)}`)).toContainText('$500')
  await expect(page.getByTestId(`month-${CURRENT}`)).toContainText('NOW')
  await expect(page.getByTestId(`month-${addMonths(CURRENT, 1)}`)).toContainText('EST')
  if (MONTH > 3) await expect(page.getByTestId(`month-${addMonths(CURRENT, -3)}`)).toContainText('—')
  // Jan..Dec months with data: from two months ago to December.
  const monthsWithData = 12 - MONTH + 3
  await expect(page.getByTestId('year-total')).toHaveText(`$${(monthsWithData * 500).toLocaleString('en-US')}`)
})

test('moves between years and keeps the data range', async ({ page }) => {
  await seed(userId)
  await page.goto('/summary')
  await page.getByRole('link', { name: `${YEAR + 1}` }).click()
  await expect(page).toHaveURL(new RegExp(`year=${YEAR + 1}`))
  await expect(page.getByTestId('year')).toHaveText(String(YEAR + 1))
  // Only up to 12 months ahead can be browsed: no link to the year after.
  await expect(page.getByRole('link', { name: `${YEAR + 2}` })).toHaveCount(0)
  await expect(page.getByTestId(`month-${addMonths(CURRENT, 12)}`)).toContainText('$500')
  await expect(page.getByTestId(`month-${addMonths(CURRENT, 13)}`)).toContainText('—')
})

test('tapping a month opens it on Home', async ({ page }) => {
  await seed(userId)
  await page.goto('/summary')
  await page.getByTestId(`month-${addMonths(CURRENT, -1)}`).click()
  await expect(page).toHaveURL(new RegExp(`month=${addMonths(CURRENT, -1)}`))
  await expect(page.getByRole('heading', { level: 1, name: formatMonthShort(addMonths(CURRENT, -1)) })).toBeVisible()
})

test('a new account sees an empty note', async ({ page }) => {
  await page.goto('/summary')
  await expect(page.getByText('Nothing to show yet.')).toBeVisible()
  await expect(page.getByTestId(/^month-/)).toHaveCount(0)
})
