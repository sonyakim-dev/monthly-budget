begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- An income source's amount changes as text, e.g. 'Mar2=450 Oct1=500', for easy comparison.
create function pg_temp.income(p_name text) returns text language sql as $$
  select coalesce(string_agg(to_char(v.effective_date, 'MonFMDD') || '=' || v.amount::int, ' ' order by v.effective_date), '')
  from public.income_source_versions v join public.income_sources s on s.id = v.source_id where s.name = p_name
$$;
create function pg_temp.source_id(p_name text) returns uuid language sql as $$ select id from public.income_sources where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

insert into public.income_sources (name, category_id, frequency, start_date)
  select 'EDD', id, 'biweekly', '2026-03-02' from public.categories where kind = 'income' order by sort limit 1;
insert into public.income_source_versions (source_id, effective_date, amount) values (pg_temp.source_id('EDD'), '2026-03-02', 450);

-- "This and later payments": from that payment's date, mid-month or not
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-10-12', 500, 'later');
select is(pg_temp.income('EDD'), 'Mar2=450 Oct12=500', 'later: payments from that date on');
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-10-12', 520, 'later');
select is(pg_temp.income('EDD'), 'Mar2=450 Oct12=520', 'changing the same date again updates its one row');
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-06-15', 600, 'later');
select is(pg_temp.income('EDD'), 'Mar2=450 Jun15=600', 'later replaces every change after that date');
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-04-13', 450, 'later');
select is(pg_temp.income('EDD'), 'Mar2=450', 'repeating the amount before leaves no row');

-- "All payments": one amount from the first payment
insert into public.income_source_versions (source_id, effective_date, amount) values (pg_temp.source_id('EDD'), '2026-08-10', 400);
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-09-21', 475, 'all');
select is(pg_temp.income('EDD'), 'Mar2=475', 'all: every payment, from the start date, whatever date was given');

-- Removing is an amount of 0
select public.set_income_amount(pg_temp.source_id('EDD'), '2026-07-06', 0, 'later');
select is(pg_temp.income('EDD'), 'Mar2=475 Jul6=0', 'remove from a date: no payments from then on');

-- Bad input
select throws_ok(
  $$ select public.set_income_amount(pg_temp.source_id('EDD'), '2026-10-15', 10, 'month') $$,
  '22023', 'scope must be all or later', 'only all or later');
select throws_ok(
  $$ select public.set_income_amount(pg_temp.source_id('EDD'), '2026-10-01', -5, 'later') $$,
  '22023', 'amount must be 0 or more', 'the amount cannot be negative');
select throws_ok(
  $$ select public.set_income_amount(gen_random_uuid(), '2026-10-01', 10, 'later') $$,
  'P0002', 'income not found', 'unknown income is refused');
select is(pg_temp.income('EDD'), 'Mar2=475 Jul6=0', 'refused calls change nothing');

-- ===== Act as user B: A's income is invisible =====
create temp table a_ids as select id from public.income_sources where name = 'EDD';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_income_amount((select id from a_ids), '2026-10-01', 1, 'later') $$,
  'P0002', 'income not found', 'another user''s income cannot be changed');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(pg_temp.income('EDD'), 'Mar2=475 Jul6=0', 'A''s income is unchanged');

select * from finish();
rollback;
