-- One payment of other income that isn't coming (a skipped week of benefits, a missed gig). Only that
-- occurrence leaves Income; the plan's amount for the month stays, unlike "remove for this month", which
-- took every payment of a weekly or biweekly source with it.
create table public.skipped_income (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid not null,
  pay_date date not null,
  created_at timestamptz not null default now(),
  unique (source_id, pay_date),
  foreign key (source_id, user_id) references public.income_sources (id, user_id) on delete cascade
);
alter table public.skipped_income enable row level security;
create policy "own rows" on public.skipped_income for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
