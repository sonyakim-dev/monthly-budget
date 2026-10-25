-- Monthly budget schema.
-- Every row belongs to a user (RLS: user_id = auth.uid()). Child rows reference
-- parents by (id, user_id), so a row can never point at another user's data.
-- Plans (bills, savings, income sources, job pay) are versioned by a start date:
-- a change applies from that date forward and earlier months never change.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- settings ----------
create table public.settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  timezone text not null default 'America/Los_Angeles',
  currency text not null default 'USD',
  emergency_target_months numeric(4,1) not null default 6 check (emergency_target_months > 0),
  redaction_terms text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contribution_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  year int not null check (year between 1900 and 2999),
  kind text not null check (kind in ('401k_employee', 'ira', 'hsa')),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, kind)
);

-- ---------- categories (income and expense) ----------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('income', 'expense')),
  name text not null check (length(name) between 1 and 60),
  sort int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- ---------- bills ----------
create table public.bill_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  color text not null default '#e5e5e0' check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id uuid not null,
  name text not null check (length(name) between 1 and 60),
  due_day int check (due_day between 1 and 31),
  varies boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id),
  foreign key (group_id, user_id) references public.bill_groups (id, user_id) on delete restrict
);

-- amount 0 means the bill is stopped from that month
create table public.bill_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  bill_id uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bill_id, effective_month),
  foreign key (bill_id, user_id) references public.bills (id, user_id) on delete cascade
);

-- ---------- savings ----------
create table public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  day_of_month int check (day_of_month between 1 and 31),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- amount 0 means saving is stopped from that month
create table public.savings_plan_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id uuid not null,
  effective_month date not null check (extract(day from effective_month) = 1),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, effective_month),
  foreign key (plan_id, user_id) references public.savings_plans (id, user_id) on delete cascade
);

-- ---------- jobs ----------
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  pay_frequency text not null check (pay_frequency in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  first_pay_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);

-- Pay terms from effective_date until the next entry. Percentages are 0–100.
create table public.job_pay_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  effective_date date not null,
  kind text not null check (kind in ('start', 'raise', 'promotion', 'contribution_change', 'end')),
  title text check (title is null or length(title) <= 80),
  annual_salary numeric(12,2) check (annual_salary > 0),
  hourly_rate numeric(10,2) check (hourly_rate > 0),
  hours_per_week numeric(5,2) check (hours_per_week > 0),
  est_tax_pct numeric(5,2) not null default 0 check (est_tax_pct between 0 and 100),
  trad_401k_pct numeric(5,2) not null default 0 check (trad_401k_pct between 0 and 100),
  roth_401k_pct numeric(5,2) not null default 0 check (roth_401k_pct between 0 and 100),
  match_pct numeric(5,2) not null default 0 check (match_pct between 0 and 100),
  allowance_monthly numeric(12,2) not null default 0 check (allowance_monthly >= 0),
  hsa_monthly numeric(12,2) not null default 0 check (hsa_monthly >= 0),
  other_deductions_monthly numeric(12,2) not null default 0 check (other_deductions_monthly >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, effective_date),
  constraint job_pay_entries_pay_required check (
    kind = 'end' or annual_salary is not null or (hourly_rate is not null and hours_per_week is not null)
  ),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete cascade
);

-- ---------- expected other income (estimates only) ----------
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  category_id uuid not null,
  frequency text not null check (frequency in ('once', 'weekly', 'biweekly', 'monthly')),
  start_date date not null,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  check (end_date is null or end_date >= start_date),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);

create table public.income_source_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source_id uuid not null,
  effective_date date not null,
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, effective_date),
  foreign key (source_id, user_id) references public.income_sources (id, user_id) on delete cascade
);

-- ---------- payslips (parsed figures only; the PDF is never stored) ----------
create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  job_id uuid not null,
  check_date date not null,
  period_start date,
  period_end date,
  pay_type text not null check (pay_type in ('regular', 'notice', 'severance', 'bonus', 'other')),
  gross numeric(12,2) not null check (gross >= 0),
  net numeric(12,2) not null check (net >= 0),
  parse_method text not null check (length(parse_method) between 1 and 40),
  reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, check_date, net),
  unique (id, user_id),
  foreign key (job_id, user_id) references public.jobs (id, user_id) on delete restrict
);

create table public.payslip_lines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payslip_id uuid not null,
  label text not null check (length(label) between 1 and 80),
  kind text not null check (kind in ('earning', 'pretax', 'tax', 'posttax', 'employer')),
  tag text not null check (tag in (
    'base', 'allowance', 'notice_pay', 'severance', 'cobra_assist', 'bonus',
    'trad_401k', 'roth_401k', 'hsa',
    'federal', 'state', 'ss', 'medicare', 'sdi',
    'match', 'hsa_employer', 'other')),
  amount numeric(12,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (payslip_id, user_id) references public.payslips (id, user_id) on delete cascade
);

-- ---------- actual entries (Activity) ----------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date date not null,
  month date generated always as (date - (extract(day from date)::int - 1)) stored,
  kind text not null check (kind in ('income', 'expense', 'bill', 'saving')),
  amount numeric(12,2) not null check (amount > 0),
  name text check (name is null or length(name) <= 120),
  notes text check (notes is null or length(notes) <= 500),
  category_id uuid,
  bill_id uuid,
  savings_plan_id uuid,
  payslip_id uuid,
  source text not null default 'manual' check (source in ('manual', 'import', 'payslip', 'sheet-import')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_links check (
    case kind
      when 'income'  then category_id is not null and bill_id is null and savings_plan_id is null
      when 'expense' then category_id is not null and bill_id is null and savings_plan_id is null and payslip_id is null
      when 'bill'    then bill_id is not null and category_id is null and savings_plan_id is null and payslip_id is null
      when 'saving'  then category_id is null and bill_id is null and payslip_id is null
    end
  ),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (bill_id, user_id) references public.bills (id, user_id) on delete restrict,
  foreign key (savings_plan_id, user_id) references public.savings_plans (id, user_id) on delete set null (savings_plan_id),
  foreign key (payslip_id, user_id) references public.payslips (id, user_id) on delete cascade
);

create index transactions_user_month_idx on public.transactions (user_id, month);
create index transactions_user_date_idx on public.transactions (user_id, date desc);

-- An income entry must use an income category, an expense entry an expense category.
create or replace function public.check_transaction_category_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Ownership is enforced by the (category_id, user_id) foreign key; this only checks the kind.
  if new.category_id is not null
     and exists (select 1 from public.categories c where c.id = new.category_id and c.kind <> new.kind) then
    raise exception 'category kind must match transaction kind' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger transactions_category_kind before insert or update on public.transactions
  for each row execute function public.check_transaction_category_kind();

-- ---------- updated_at triggers, RLS ----------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'contribution_limits', 'categories', 'bill_groups', 'bills', 'bill_versions',
    'savings_plans', 'savings_plan_versions', 'jobs', 'job_pay_entries', 'income_sources',
    'income_source_versions', 'payslips', 'payslip_lines', 'transactions'
  ] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_updated_at', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
      t);
  end loop;
end;
$$;

-- ---------- defaults for a new user ----------
-- Creates the settings row, generic categories and bill groups. Safe to call on every
-- sign-in: each part is skipped if it already exists.
create or replace function public.seed_defaults()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  i int;
  expense_names text[] := array['Groceries', 'Dining', 'Coffee', 'Delivery', 'Rideshare', 'Shopping', 'Essentials',
                                'Leisure', 'Travel', 'Personal care', 'Gifts', 'Pharmacy', 'Fitness', 'Misc'];
  income_names text[] := array['Salary', 'Unemployment', 'Bonus', 'Severance', 'Side income',
                               'Interest & dividends', 'Tax refund', 'Gift', 'Other income'];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into settings (user_id) values (uid) on conflict (user_id) do nothing;

  if not exists (select 1 from categories where user_id = uid) then
    for i in 1 .. array_length(expense_names, 1) loop
      insert into categories (user_id, kind, name, sort) values (uid, 'expense', expense_names[i], i);
    end loop;
    for i in 1 .. array_length(income_names, 1) loop
      insert into categories (user_id, kind, name, sort) values (uid, 'income', income_names[i], i);
    end loop;
  end if;

  if not exists (select 1 from bill_groups where user_id = uid) then
    insert into bill_groups (user_id, name, color, sort) values
      (uid, 'Housing', '#f5d76e', 1),
      (uid, 'Auto', '#9ccc9c', 2),
      (uid, 'Subscriptions', '#b9a8e0', 3);
  end if;
end;
$$;

revoke all on function public.seed_defaults() from public, anon;
grant execute on function public.seed_defaults() to authenticated;
