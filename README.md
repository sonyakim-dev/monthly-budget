# Monthly Budget

Monthly Budget (called **Sumday** in the app) is a personal budgeting app for planning what
you can spend after bills and savings. Record everyday expenses from your phone, plan recurring
income and commitments, and see how they affect the current month and the months ahead.

It's built for someone who wants a month-by-month view of their money and is comfortable
hosting their own app. You deploy your own copy with your own Supabase database and control
who can sign in. Your chosen hosting providers still process and store the data.

**Stack:** Next.js (App Router) · Supabase (Postgres, Auth) · Tailwind CSS + shadcn/ui · Vercel

## What is it for?

The main question is: **“After this month's bills and planned savings, how much is left to spend?”**
Home brings income, bills, savings, and everyday expenses together around one figure:

```text
Safe to spend = recorded and expected income − bills − planned cash savings − expenses
```

Use it to record a purchase, adjust a recurring bill, plan a one-time cost, or compare months
before changing a commitment. The yearly Summary brings those monthly figures together so
you can see the broader effect of your plans.

“Safe to spend” is a budget projection, not your bank balance: it includes expected income
and does not check whether that money is already available in your account.

## How is its approach different?

These are the choices that define Sumday, rather than features claimed to be unique to it:

- **A monthly spending remainder is the starting point.** The main screen puts money left
  after commitments ahead of transaction charts or category spending limits.
- **Plans and recorded activity share one view.** Recurring bills, savings, and expected
  income appear alongside actual entries, making future months useful before you have
  recorded any spending in them.
- **Changes can apply to one month or continue forward.** Skip a bill for a month, add a
  one-time saving, or change a recurring amount from a selected month onward. Amount
  versions preserve earlier months; names and other plan details apply across months.
- **Paycheck savings are visible separately from spendable cash.** The calculation supports
  take-home pay estimates and 401(k), employer-match, and HSA figures. Payroll savings are
  shown without subtracting them a second time from take-home pay.
- **You manage the deployment and access.** There is no bank connection required. Entries
  are managed manually, access is limited to an email allowlist, and each user's database
  rows are isolated. This also means you take responsibility for hosting and maintenance.

## Features available now

- Magic-link sign-in, limited to an email allowlist
- Add expenses and one-time or recurring income from Home
- Edit and delete manual entries
- Add and adjust bills and savings plans for one month or from that month onward
- Organize bills into groups and reorder them
- Browse monthly income, savings, bills, and expenses, with expenses grouped by category
- Yearly Summary of monthly spending remainders and totals
- Row-level security on every table — each user only ever sees their own rows

The app is still in development. The Plan page, including job-management controls referenced
by paycheck notes, is not yet implemented. Payslip parsing code exists, but a complete
upload-and-save workflow is not yet available in the app.

## Run it locally

Prerequisites: Node 22+, pnpm, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
(`brew install supabase/tap/supabase` on macOS).

```bash
pnpm install
supabase start                 # starts Postgres/Auth locally in Docker and applies migrations
cp .env.example .env.local     # fill in values printed by `supabase status`
pnpm dev
```

Create your user in local Supabase Studio (http://127.0.0.1:54323 → Authentication → Add user),
put the same email in `ALLOWED_EMAILS`, then sign in at http://localhost:3000. Local emails are
caught by Mailpit at http://127.0.0.1:54324.

## Tests

```bash
pnpm test        # unit tests (Vitest)
pnpm test:db     # database and row-level security tests (pgTAP, needs `supabase start`)
pnpm test:e2e    # browser tests (Playwright, needs `supabase start`)
```

The browser tests start their own dev server on port 3100 with a separate build folder
(`.next-e2e`), so they can run while `pnpm dev` is up.

## Deploy your own copy

1. **Supabase:** create a project. Link and push the schema:
   `supabase link --project-ref <ref>` then `supabase db push`.
2. **Auth settings (Supabase dashboard → Authentication):**
   - Turn off "Allow new users to sign up".
   - Users → Add user → **Create new user** with your email (don't use "Invite": its email link
     isn't one this app reads).
   - URL Configuration: set Site URL to your app URL and add `https://<your-app>/auth/confirm` to Redirect URLs.
   - Email Templates → Magic Link: use the template in `supabase/templates/magic_link.html`
     (the link must be `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`).
3. **Vercel:** import the repository and set `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `ALLOWED_EMAILS` (your email). The secret key is only
   used by local tests and scripts — don't add it to Vercel.
4. Open your app, enter your email on the sign-in page, and use the link from your inbox.

Note: Supabase's free plan pauses projects after 7 days without activity; a daily keep-alive job
is added in a later version.

## Contributing / forking

Keep personal data out of the repository: tests and examples use made-up values and
`@example.test` addresses. `docs/` and `private/` are gitignored for your own notes and scripts.
