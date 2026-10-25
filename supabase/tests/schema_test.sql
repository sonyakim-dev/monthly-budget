begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- Structure: every public table has RLS on and a user_id column
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and not rowsecurity),
  0, 'every public table has row-level security enabled');
select is(
  (select count(*)::int from pg_tables t where schemaname = 'public'
     and not exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public' and c.table_name = t.tablename and c.column_name = 'user_id')),
  0, 'every public table has a user_id column');

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select lives_ok($$ select public.seed_defaults() $$, 'A can seed defaults');
select lives_ok($$ select public.seed_defaults() $$, 'seeding twice is a no-op');
select is((select count(*)::int from public.settings), 1, 'one settings row');
select is((select count(*)::int from public.categories where kind = 'expense'), 14, '14 default expense categories');
select ok((select exists (select 1 from public.categories where kind = 'expense' and name = 'Drinks')), 'Drinks is a default expense category');
select is((select string_agg(name, ', ' order by sort) from public.categories where kind = 'expense'), 'Dining, Drinks, Groceries, Essentials, Shopping, Personal care, Rideshare, Travel, Leisure, Gifts, Fitness, Delivery, Pharmacy, Misc', 'expense categories are in picking order');
select is((select count(*)::int from public.categories where kind = 'income'), 9, '9 default income categories');
select is((select count(*)::int from public.bill_groups), 3, '3 default bill groups');

-- Bills are versioned by month
insert into public.bills (group_id, name, due_day) select id, 'Rent', 1 from public.bill_groups where name = 'Housing';
insert into public.bill_versions (bill_id, effective_month, amount) select id, '2026-01-01', 1200 from public.bills where name = 'Rent';
select throws_ok(
  $$ insert into public.bill_versions (bill_id, effective_month, amount) select id, '2026-03-15', 1300 from public.bills where name = 'Rent' $$,
  '23514', null, 'a bill version starts on the first of a month');
select throws_ok(
  $$ insert into public.bill_versions (bill_id, effective_month, amount) select id, '2026-01-01', 1300 from public.bills where name = 'Rent' $$,
  '23505', null, 'one version per bill per month');

-- Transactions: kind rules
insert into public.transactions (date, kind, amount, category_id, name)
select '2026-01-31', 'income', 1000, id, 'Pay' from public.categories where name = 'Salary';
select is((select month from public.transactions where name = 'Pay'), '2026-01-01'::date, 'month is derived from the date');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, category_id) select '2026-01-05', 'expense', 5, id from public.categories where name = 'Salary' $$,
  '23514', null, 'an expense cannot use an income category');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount) values ('2026-01-05', 'bill', 5) $$,
  '23514', null, 'a bill payment needs a bill');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, category_id) select '2026-01-05', 'expense', 0, id from public.categories where name = 'Dining' $$,
  '23514', null, 'amounts must be positive');

-- Jobs: every entry except an end needs a salary or hourly rate
insert into public.jobs (name, pay_frequency) values ('Acme', 'biweekly');
insert into public.job_pay_entries (job_id, effective_date, kind, annual_salary) select id, '2026-01-01', 'start', 100000 from public.jobs where name = 'Acme';
select throws_ok(
  $$ insert into public.job_pay_entries (job_id, effective_date, kind) select id, '2026-04-01', 'raise' from public.jobs where name = 'Acme' $$,
  '23514', null, 'a raise needs a salary or hourly rate');

-- Payslips: the same job, check date and net is a duplicate
insert into public.payslips (job_id, check_date, pay_type, gross, net, parse_method)
select id, '2026-01-16', 'regular', 4000, 3000, 'manual' from public.jobs where name = 'Acme';
select throws_ok(
  $$ insert into public.payslips (job_id, check_date, pay_type, gross, net, parse_method)
     select id, '2026-01-16', 'regular', 4000, 3000, 'manual' from public.jobs where name = 'Acme' $$,
  '23505', null, 'a duplicate payslip is rejected');

insert into public.savings_plans (name, day_of_month) values ('HYSA', 2);
insert into public.income_sources (name, category_id, frequency, start_date)
select 'Benefits', id, 'weekly', '2026-05-09' from public.categories where name = 'Unemployment';

select set_config('test.a_rent', (select id::text from public.bills where name = 'Rent'), true);
select set_config('test.a_dining', (select id::text from public.categories where name = 'Dining'), true);
select set_config('test.a_job', (select id::text from public.jobs where name = 'Acme'), true);

-- ===== Act as user B =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.categories), 0, 'B sees none of A''s categories');
select is((select count(*)::int from public.transactions), 0, 'B sees none of A''s transactions');
select is((select count(*)::int from public.bills), 0, 'B sees none of A''s bills');
select is((select count(*)::int from public.jobs), 0, 'B sees none of A''s jobs');
select is((select count(*)::int from public.payslips), 0, 'B sees none of A''s payslips');
select is((select count(*)::int from public.savings_plans), 0, 'B sees none of A''s savings plans');
select is((select count(*)::int from public.income_sources), 0, 'B sees none of A''s income sources');
select throws_ok(
  $$ insert into public.bill_versions (bill_id, effective_month, amount) values (current_setting('test.a_rent')::uuid, '2026-02-01', 1) $$,
  '23503', null, 'B cannot add a version to A''s bill');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, category_id) values ('2026-01-05', 'expense', 5, current_setting('test.a_dining')::uuid) $$,
  '23503', null, 'B cannot use A''s category');
select throws_ok(
  $$ insert into public.job_pay_entries (job_id, effective_date, kind, annual_salary) values (current_setting('test.a_job')::uuid, '2026-05-01', 'raise', 1) $$,
  '23503', null, 'B cannot add pay entries to A''s job');
select results_eq(
  $$ with u as (update public.transactions set amount = 1 returning 1) select count(*)::int from u $$,
  $$ values (0) $$, 'B cannot update A''s transactions');

-- ===== Anonymous =====
set local role anon;
select is((select count(*)::int from public.transactions), 0, 'anonymous visitors see nothing');

-- ===== Seeding needs a signed-in user =====
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select throws_ok($$ select public.seed_defaults() $$, 'P0001', 'not authenticated', 'seed_defaults requires a user');

select * from finish();
rollback;
