begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- A savings plan's amount changes as text, e.g. 'Oct=300 Dec=0', for easy comparison.
create function pg_temp.saving(p_name text) returns text language sql as $$
  select coalesce(string_agg(to_char(v.effective_month, 'Mon') || '=' || v.amount::int, ' ' order by v.effective_month), '')
  from public.savings_plan_versions v join public.savings_plans p on p.id = v.plan_id where p.name = p_name
$$;
create function pg_temp.plan_id(p_name text) returns uuid language sql as $$ select id from public.savings_plans where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into public.savings_plans (name, sort) values ('HYSA', 3);

-- A new plan
select is(public.add_savings_plan('Trip', 5, '2026-10-01', 300), false, 'a new name adds a savings plan');
select is(pg_temp.saving('Trip'), 'Oct=300', 'it repeats every month from the month it was added');
select is((select (day_of_month, sort)::text from public.savings_plans where name = 'Trip'), '(5,4)', 'with its day, at the end of the list');

select throws_ok(
  $$ select public.add_savings_plan('Trip', null, '2026-11-01', 40) $$,
  '23505', 'savings plan already exists', 'a plan still running that month cannot be added again');

-- Restarting a removed plan
select public.set_savings_amount(pg_temp.plan_id('Trip'), '2026-12-01', 0, false);
select is(public.add_savings_plan('Trip', null, '2027-02-01', 350), true, 'a removed plan''s name restarts it');
select is(pg_temp.saving('Trip'), 'Oct=300 Dec=0 Feb=350', 'from that month on, keeping its history');
select is((select (day_of_month, sort)::text from public.savings_plans where name = 'Trip'), '(,4)', 'with the new day, in its old place');
select is((select count(*)::int from public.savings_plans where name = 'Trip'), 1, 'still one plan');

-- One time
select is(public.add_savings_plan('Gift', null, '2026-10-01', 100, true), false, 'a one-time saving is added');
select is(pg_temp.saving('Gift'), 'Oct=100 Nov=0', 'it is only in that month');
select is(public.add_savings_plan('Gift', null, '2026-12-01', 80, true), true, 'the same name in a later month is the same plan');
select is(pg_temp.saving('Gift'), 'Oct=100 Nov=0 Dec=80 Jan=0', 'with another one-time amount');

-- Bad input leaves nothing behind
select throws_ok(
  $$ select public.add_savings_plan('Car', null, '2026-10-15', 10) $$,
  '22023', 'month must be the first of a month', 'the month must be the first of a month');
select throws_ok(
  $$ select public.add_savings_plan('Car', null, '2026-10-01', 0) $$,
  '22023', 'amount must be more than 0', 'the amount must be more than 0');
select is((select count(*)::int from public.savings_plans where name = 'Car'), 0, 'refused calls add no plan');

-- ===== Act as user B =====
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is(public.add_savings_plan('Trip', null, '2026-10-01', 25), false, 'the same name as another user''s plan adds a new plan');

select * from finish();
rollback;
