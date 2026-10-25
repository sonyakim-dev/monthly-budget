import { expect, test } from '@playwright/test'
import { admin, E2E_EMAILS, resetUser, signIn, STRANGER_EMAIL } from './helpers'

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('an allowlisted user signs in with a magic link and lands on Home', async ({ page }) => {
  await resetUser(E2E_EMAILS.auth)
  await signIn(page, E2E_EMAILS.auth)
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByTestId('safe-to-spend')).toBeVisible()
})

test('an account that is not on the allowlist is signed out and gets no data', async ({ page }) => {
  const strangerId = await resetUser(STRANGER_EMAIL)
  await signIn(page, STRANGER_EMAIL)
  await expect(page).toHaveURL(/\/login\?error=not-allowed$/)
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText("This account isn't allowed to use this app.")

  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)

  const { count } = await admin()
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', strangerId)
  expect(count).toBe(0)
})

test('the login form answers the same for allowed and unknown emails', async ({ page }) => {
  // A fresh user has no "last link sent" time, so the per-email resend limit can't trip this test.
  await resetUser(E2E_EMAILS.auth)
  for (const email of [E2E_EMAILS.auth, STRANGER_EMAIL, 'nobody@example.test']) {
    await page.goto('/login')
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a sign-in link' }).click()
    await expect(page.getByRole('status')).toHaveText('If this email is allowed, a sign-in link is on its way.')
  }
})

test('an invalid link shows an explanation', async ({ page }) => {
  await page.goto('/auth/confirm?token_hash=bogus&type=magiclink')
  await expect(page).toHaveURL(/\/login\?error=link$/)
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText('That sign-in link is invalid or has expired. Request a new one.')
})

test('the old /home address redirects to /', async ({ page }) => {
  await resetUser(E2E_EMAILS.auth)
  await signIn(page, E2E_EMAILS.auth)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/$/)
})
