import { expect, test } from '@playwright/test'
import { regularSpec } from '../../lib/payslip/fixtures/workday'
import { admin, assertTestUser, E2E_EMAILS, resetUser, signIn } from './helpers'
import { blankPdf, payslipPdf } from './payslip-pdf'

let userId = ''

test.beforeEach(async ({ page, isMobile }) => {
  test.skip(isMobile, 'payslip upload is desktop only for now')
  userId = await resetUser(E2E_EMAILS.dashboard)
  await signIn(page, E2E_EMAILS.dashboard)
})

const pick = async (page: import('@playwright/test').Page, files: { name: string; buffer: Buffer }[]) => {
  await page.goto('/plan')
  await page.getByLabel('Payslip PDFs').setInputFiles(files.map((f) => ({ name: f.name, mimeType: 'application/pdf', buffer: f.buffer })))
}

test('a Workday payslip is parsed into the review queue and opens for review', async ({ page }) => {
  await pick(page, [{ name: '04-10-2026.pdf', buffer: await payslipPdf(regularSpec) }])
  const queue = page.getByTestId('payslip-queue')
  const row = queue.getByRole('button', { name: /04-10-2026\.pdf/ })
  await expect(row).toContainText('READY')
  await expect(row).toContainText('Example Corp · Apr 10, 2026 · regular · reconciles')
  await expect(row).toContainText('Net $2,360.00')
  await expect(queue).toContainText('1 ready · 0 to check · 0 duplicate · 0 unreadable')

  await row.click()
  const review = page.getByTestId('payslip-review')
  await expect(review.getByText('Example Corp', { exact: true })).toBeVisible()
  await expect(review.getByRole('status')).toContainText('✓ reconciles')
  await expect(review.getByRole('row', { name: /Regular Pay/ })).toContainText('$4,030.00')
  await expect(review.getByRole('row', { name: /401k Match/ })).toContainText('$160.00')
  await expect(review.getByRole('row', { name: /Dental PPO ER/ })).toHaveCount(0) // employer insurance is skipped
})

test('unknown labels and non-reconciling statements are flagged to check', async ({ page }) => {
  const spec = { ...regularSpec, earnings: [...regularSpec.earnings, { label: 'Wellness Stipend', current: 50, ytd: 50 }] }
  spec.summary = { ...spec.summary, gross: 4110, net: 2410 }
  await pick(page, [{ name: 'oct.pdf', buffer: await payslipPdf(spec) }])
  const row = page.getByTestId('payslip-queue').getByRole('button', { name: /oct\.pdf/ })
  await expect(row).toContainText('CHECK')
  await expect(row).toContainText('1 unknown line: “Wellness Stipend”')
  await row.click()
  await expect(page.getByTestId('payslip-review').getByRole('row', { name: /Wellness Stipend/ })).toContainText('NEW LABEL')
})

test('a payslip already saved is flagged as a duplicate', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly' }).select('id').single()
  const { error } = await db.from('payslips').insert({ user_id: userId, job_id: job!.id, check_date: '2026-04-10', pay_type: 'regular', gross: 4060, net: 2360, parse_method: 'workday', reconciled: true })
  expect(error).toBeNull()

  await pick(page, [{ name: 'again.pdf', buffer: await payslipPdf(regularSpec) }])
  const row = page.getByTestId('payslip-queue').getByRole('button', { name: /again\.pdf/ })
  await expect(row).toContainText('DUPLICATE')
  await expect(page.getByTestId('payslip-queue')).toContainText('0 ready · 0 to check · 1 duplicate')
})

test('a PDF with no text cannot be read', async ({ page }) => {
  await pick(page, [{ name: 'scan.pdf', buffer: await blankPdf() }])
  const row = page.getByTestId('payslip-queue').getByRole('button', { name: /scan\.pdf/ })
  await expect(row).toContainText("COULDN'T READ")
  await expect(row).toContainText('No text in this PDF')
  await expect(row).toBeDisabled()
})

test('the parse endpoint is not reachable signed out', async ({ request }) => {
  // The session proxy sends signed-out requests to the login page before the route runs.
  const fresh = await request.post('/api/payslips/parse', { headers: { cookie: '' }, maxRedirects: 0, multipart: { file: { name: 'x.pdf', mimeType: 'application/pdf', buffer: await blankPdf() } } })
  expect([302, 307]).toContain(fresh.status())
  expect(fresh.headers()['location']).toMatch(/\/login/)
})

test('a ready payslip saves and shows on Home as received income', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly', first_pay_date: '2026-04-10' }).select('id').single()
  const { error } = await db.from('job_pay_entries').insert({ user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 105560 })
  expect(error).toBeNull()

  await pick(page, [{ name: '04-10-2026.pdf', buffer: await payslipPdf(regularSpec) }])
  await page.getByTestId('payslip-queue').getByRole('button', { name: 'Save 1 ready' }).click()
  await expect(page.getByText('1 payslip saved')).toBeVisible()
  await expect(page.getByTestId('payslip-queue')).toHaveCount(0)
  await expect(page.getByRole('list').getByText('Apr 10, 2026')).toBeVisible() // now in the saved list

  await page.goto('/?month=2026-04')
  const line = page.getByTestId('current-month').getByRole('button', { name: /^Example Corp/ })
  await expect(line).toContainText('Apr 10')
  await expect(line).not.toContainText('(est)')
  await expect(line).toContainText('$2,360.00')
  await expect(page.getByTestId('current-month').getByRole('button', { name: /^Wage \(Example Corp\) · Apr 10/ })).toHaveCount(0)
})

test('a payslip to check is saved from its review, choosing a new job', async ({ page }) => {
  const spec = { ...regularSpec, earnings: [...regularSpec.earnings, { label: 'Wellness Stipend', current: 50, ytd: 50 }], summary: { ...regularSpec.summary, gross: 4110, net: 2410 } }
  await pick(page, [{ name: 'oct.pdf', buffer: await payslipPdf(spec) }])
  await page.getByTestId('payslip-queue').getByRole('button', { name: /oct\.pdf/ }).click()
  const review = page.getByTestId('payslip-review')
  await expect(review.getByLabel('Job', { exact: true })).toHaveValue('new') // no job matches yet: a new one is offered
  await expect(review.getByLabel('New job name')).toHaveValue('Example Corp')
  await review.getByLabel('Wellness Stipend counts as').selectOption('allowance')
  await review.getByRole('button', { name: 'Save payslip' }).click()
  await expect(page.getByText('1 payslip saved')).toBeVisible()

  await assertTestUser(userId)
  const { data: lines } = await admin().from('payslip_lines').select('label, tag').eq('user_id', userId).eq('label', 'Wellness Stipend')
  expect(lines).toEqual([{ label: 'Wellness Stipend', tag: 'allowance' }])
  const { data: jobs } = await admin().from('jobs').select('name, pay_frequency').eq('user_id', userId)
  expect(jobs).toEqual([{ name: 'Example Corp', pay_frequency: 'biweekly' }])
})

test('a payslip that does not reconcile needs Save anyway', async ({ page }) => {
  const spec = { ...regularSpec, summary: { ...regularSpec.summary, net: 2300 } }
  await pick(page, [{ name: 'off.pdf', buffer: await payslipPdf(spec) }])
  await page.getByTestId('payslip-queue').getByRole('button', { name: /off\.pdf/ }).click()
  const review = page.getByTestId('payslip-review')
  await expect(review.getByRole('button', { name: 'Save payslip' })).toHaveCount(0)
  await review.getByRole('button', { name: 'Save anyway' }).click()
  await expect(page.getByText('1 payslip saved')).toBeVisible()
  await expect(page.getByRole('list').getByText('⚠ CHECK')).toBeVisible()
})

test('Plan shows the three newest payslips; View all opens the full list', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly' }).select('id').single()
  const rows = Array.from({ length: 7 }, (_, i) => ({ user_id: userId, job_id: job!.id, check_date: `2026-0${i + 1}-15`, pay_type: 'regular', gross: 4000, net: 3000 + i, parse_method: 'workday', reconciled: true }))
  const { error } = await db.from('payslips').insert(rows)
  expect(error).toBeNull()

  await page.goto('/plan')
  const list = page.getByTestId('saved-payslips')
  await expect(list.getByRole('listitem')).toHaveCount(3)
  await expect(list).toContainText('Jul 15, 2026') // newest first
  await expect(list).not.toContainText('Apr 15, 2026')
  await page.getByRole('link', { name: 'View all 7' }).click()
  await expect(page).toHaveURL(/\/plan\/payslips$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Payslips' })).toBeVisible()
  await expect(page.getByTestId('saved-payslips').getByRole('listitem')).toHaveCount(7)
  await expect(page.getByTestId('saved-payslips')).toContainText('Jan 15, 2026')
  await page.getByRole('link', { name: 'Back to Plan' }).click()
  await expect(page).toHaveURL(/\/plan$/)
})

test('the review compares the payslip with the job on the check date and follows the "counts as" choices', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly' }).select('id').single()
  // Biweekly $105,560 = $4,060 gross; HSA $216.67/mo ≈ $100; the fixture puts in 9.9% + 7.4% and gets a 3.9% match.
  const { error } = await db.from('job_pay_entries').insert({
    user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 105560,
    est_tax_pct: 22, trad_401k_pct: 10, roth_401k_pct: 7.5, hsa_monthly: 216.67, match_tiers: [{ match_pct: 100, of_pct: 4 }],
  })
  expect(error).toBeNull()

  await pick(page, [{ name: '04-10-2026.pdf', buffer: await payslipPdf(regularSpec) }])
  await page.getByTestId('payslip-queue').getByRole('button', { name: /04-10-2026\.pdf/ }).click()
  const compared = page.getByRole('region', { name: 'Compared with the job' })
  await expect(compared).toContainText('Compared with Example Corp on Apr 10, 2026')
  await expect(compared.getByRole('row', { name: /401\(k\) traditional/ })).toContainText('OK')
  await expect(compared.getByRole('row', { name: /Employer match/ })).toContainText('$160.00 = 3.9%')
  await expect(compared.getByRole('row', { name: /Employer match/ })).toContainText('OK')
  await expect(compared.getByRole('row', { name: /HSA/ })).toContainText('OK')
  await expect(compared.getByRole('row', { name: /Taxes/ })).toContainText('INFO')
  await expect(compared.getByRole('row', { name: /Gross per paycheck/ })).toContainText('OK')

  // Retagging the Roth line changes what the payslip implies
  await page.getByTestId('payslip-review').getByLabel('401k Roth counts as').selectOption('other')
  await expect(compared.getByRole('row', { name: /401\(k\) Roth/ })).toContainText('DIFFERS')

  // A new job has nothing to compare yet
  await page.getByLabel('Job', { exact: true }).selectOption('new')
  await expect(compared).toContainText('Pick a job')
})

test('"Update job" records what the payslip showed as a pay change from the period start', async ({ page }) => {
  await assertTestUser(userId)
  const db = admin()
  const { data: job } = await db.from('jobs').insert({ user_id: userId, name: 'Example Corp', pay_frequency: 'biweekly' }).select('id').single()
  // The job says 5% traditional; the fixture puts in 9.9%
  const { error } = await db.from('job_pay_entries').insert({
    user_id: userId, job_id: job!.id, effective_date: '2026-01-01', kind: 'start', annual_salary: 105560,
    est_tax_pct: 22, trad_401k_pct: 5, roth_401k_pct: 7.5, hsa_monthly: 216.67, match_tiers: [{ match_pct: 100, of_pct: 4 }],
  })
  expect(error).toBeNull()

  await pick(page, [{ name: '04-10-2026.pdf', buffer: await payslipPdf(regularSpec) }])
  await page.getByTestId('payslip-queue').getByRole('button', { name: /04-10-2026\.pdf/ }).click()
  const compared = page.getByRole('region', { name: 'Compared with the job' })
  await expect(compared.getByRole('row', { name: /401\(k\) traditional/ })).toContainText('DIFFERS')
  await compared.getByRole('button', { name: 'Update job from Mar 22, 2026: 401(k) 9.9%' }).click()
  await expect(compared.getByRole('status')).toContainText('Example Corp updated from Mar 22, 2026.')
  await expect(compared.getByRole('row', { name: /401\(k\) traditional/ })).toContainText('OK')
  await expect(compared.getByRole('button', { name: /Update job/ })).toHaveCount(0)

  const { data: entries } = await db.from('job_pay_entries').select('effective_date, kind, trad_401k_pct, roth_401k_pct, hsa_monthly, annual_salary').eq('job_id', job!.id).order('effective_date')
  expect(entries).toEqual([
    expect.objectContaining({ effective_date: '2026-01-01', kind: 'start', trad_401k_pct: 5 }),
    expect.objectContaining({ effective_date: '2026-03-22', kind: 'contribution_change', trad_401k_pct: 9.9, roth_401k_pct: 7.5, hsa_monthly: 216.67, annual_salary: 105560 }),
  ])
})
