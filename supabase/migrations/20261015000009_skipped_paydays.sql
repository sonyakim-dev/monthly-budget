-- Paydays estimated from a job that didn't happen (no paycheck that day). A skipped payday leaves Income
-- and paycheck savings; uploading a payslip for it unskips it.
create table public.skipped_paydays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  pay_date date not null,
  created_at timestamptz not null default now(),
  unique (job_id, pay_date),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);
alter table public.skipped_paydays enable row level security;
create policy "own rows" on public.skipped_paydays for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
