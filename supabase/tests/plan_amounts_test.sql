begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- A bill's (or savings plan's) amount changes as text, e.g. 'Jan=1000 Jun=1100', for easy comparison.
create function pg_temp.bill(p_name text) returns text language sql as $$
  select coalesce(string_agg(to_char(v.effective_month, 'Mon') || '=' || v.amount::int, ' ' order by v.effective_month), '')
  from public.bill_versions v join public.bills b on b.id = v.bill_id where b.name = p_name
$$;
create function pg_temp.saving(p_name text) returns text language sql as $$
  select coalesce(string_agg(to_char(v.effective_month, 'Mon') || '=' || v.amount::int, ' ' order by v.effective_month), '')
  from public.savings_plan_versions v join public.savings_plans p on p.id = v.plan_id where p.name = p_name
$$;
create function pg_temp.bill_id(p_name text) returns uuid language sql as $$ select id from public.bills where name = p_name $$;
create function pg_temp.plan_id(p_name text) returns uuid language sql as $$ select id from public.savings_plans where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

insert into public.bills (group_id, name) select id, 'Rent' from public.bill_groups where name = 'Housing';
insert into public.bill_versions (bill_id, effective_month, amount) values
  (pg_temp.bill_id('Rent'), '2026-01-01', 1000),
  (pg_temp.bill_id('Rent'), '2026-06-01', 1100);

-- "This month and later"
select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-10-01', 1200, false);
select is(pg_temp.bill('Rent'), 'Jan=1000 Jun=1100 Oct=1200', 'and later: sets the amount from that month');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-10-01', 1250, false);
select is(pg_temp.bill('Rent'), 'Jan=1000 Jun=1100 Oct=1250', 'changing the same month again updates its one row');

-- "Just this month"
select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-08-01', 900, true);
select is(pg_temp.bill('Rent'), 'Jan=1000 Jun=1100 Aug=900 Sep=1100 Oct=1250', 'just this month: the next month goes back to the old amount');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-09-01', 950, true);
select is(pg_temp.bill('Rent'), 'Jan=1000 Jun=1100 Aug=900 Sep=950 Oct=1250', 'just this month: an amount already set for the next month is kept');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-08-01', 1100, true);
select is(pg_temp.bill('Rent'), 'Jan=1000 Jun=1100 Sep=950 Oct=1250', 'setting a month back to the amount before it removes its row');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-03-01', 1050, false);
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050', 'and later: replaces changes scheduled after that month; earlier months never change');

-- Stopping is an amount of 0
select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-04-01', 0, true);
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050 Apr=0 May=1050', 'stop just this month: skips one month');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-07-01', 0, false);
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050 Apr=0 May=1050 Jul=0', 'stop from a month: stopped from then on');

select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-07-01', 1050, false);
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050 Apr=0 May=1050', 'restarting at the same amount removes the stop');

-- A bill with no amounts yet
insert into public.bills (group_id, name) select id, 'Gym' from public.bill_groups where name = 'Housing';
select public.set_bill_amount(pg_temp.bill_id('Gym'), '2026-10-01', 30, true);
select is(pg_temp.bill('Gym'), 'Oct=30 Nov=0', 'just this month on a new bill: only that month');

select public.set_bill_amount(pg_temp.bill_id('Gym'), '2026-10-01', 0, true);
select is(pg_temp.bill('Gym'), '', 'stopping its only month leaves no rows');

select public.set_bill_amount(pg_temp.bill_id('Gym'), '2026-11-01', 40, false);
select is(pg_temp.bill('Gym'), 'Nov=40', 'and later on a new bill: from that month on');

-- Bad input
select throws_ok(
  $$ select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-10-15', 10, false) $$,
  '22023', 'month must be the first of a month', 'the month must be the first of a month');
select throws_ok(
  $$ select public.set_bill_amount(pg_temp.bill_id('Rent'), '2026-10-01', -5, false) $$,
  '22023', 'amount must be 0 or more', 'the amount cannot be negative');
select throws_ok(
  $$ select public.set_bill_amount(gen_random_uuid(), '2026-10-01', 10, false) $$,
  'P0002', 'bill not found', 'an unknown bill is refused');
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050 Apr=0 May=1050', 'refused calls change nothing');

-- Savings plans work the same way
insert into public.savings_plans (name) values ('HYSA');
insert into public.savings_plan_versions (plan_id, effective_month, amount) values (pg_temp.plan_id('HYSA'), '2026-01-01', 500);

select public.set_savings_amount(pg_temp.plan_id('HYSA'), '2026-10-01', 300, true);
select is(pg_temp.saving('HYSA'), 'Jan=500 Oct=300 Nov=500', 'savings, just this month');

select public.set_savings_amount(pg_temp.plan_id('HYSA'), '2026-10-01', 300, false);
select is(pg_temp.saving('HYSA'), 'Jan=500 Oct=300', 'savings, and later');

select public.set_savings_amount(pg_temp.plan_id('HYSA'), '2026-12-01', 0, false);
select is(pg_temp.saving('HYSA'), 'Jan=500 Oct=300 Dec=0', 'savings, stop from a month');

select throws_ok(
  $$ select public.set_savings_amount(gen_random_uuid(), '2026-10-01', 10, false) $$,
  'P0002', 'savings plan not found', 'an unknown savings plan is refused');

-- ===== Act as user B: A's plans are invisible =====
create temp table a_ids as
  select 'bill' as kind, id from public.bills where name = 'Rent'
  union all select 'saving', id from public.savings_plans where name = 'HYSA';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select throws_ok(
  $$ select public.set_bill_amount((select id from a_ids where kind = 'bill'), '2026-10-01', 1, false) $$,
  'P0002', 'bill not found', 'another user''s bill cannot be changed');
select throws_ok(
  $$ select public.set_savings_amount((select id from a_ids where kind = 'saving'), '2026-10-01', 1, false) $$,
  'P0002', 'savings plan not found', 'another user''s savings plan cannot be changed');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(pg_temp.bill('Rent'), 'Jan=1000 Mar=1050 Apr=0 May=1050', 'A''s bill is unchanged');
select is(pg_temp.saving('HYSA'), 'Jan=500 Oct=300 Dec=0', 'A''s savings plan is unchanged');

select * from finish();
rollback;
