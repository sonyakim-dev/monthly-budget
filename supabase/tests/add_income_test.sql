begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- An income source as text, e.g. 'once Oct28 Oct28=1200', for easy comparison.
create function pg_temp.income(p_name text) returns text language sql as $$
  select s.frequency || ' ' || to_char(s.start_date, 'MonFMDD') || ' ' ||
    (select string_agg(to_char(v.effective_date, 'MonFMDD') || '=' || v.amount::int, ' ' order by v.effective_date)
     from public.income_source_versions v where v.source_id = s.id)
  from public.income_sources s where s.name = p_name
$$;
create function pg_temp.category(p_name text) returns uuid language sql as $$ select id from public.categories where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

select isnt(public.add_income('Freelance', pg_temp.category('Side income'), 'once', '2026-10-28', 1200), null, 'one-time income is added');
select is(pg_temp.income('Freelance'), 'once Oct28 Oct28=1200', 'paid once, on its date');
select is((select category_id = pg_temp.category('Side income') from public.income_sources where name = 'Freelance'), true, 'in its category');

select public.add_income('Tutoring', pg_temp.category('Side income'), 'biweekly', '2026-11-03', 300);
select is(pg_temp.income('Tutoring'), 'biweekly Nov3 Nov3=300', 'repeating income starts on its first payment');

-- Bad input leaves nothing behind
select throws_ok(
  $$ select public.add_income('Gift', pg_temp.category('Side income'), 'once', '2026-10-01', 0) $$,
  '22023', 'amount must be more than 0', 'the amount must be more than 0');
select throws_ok(
  $$ select public.add_income('Gift', pg_temp.category('Groceries'), 'once', '2026-10-01', 10) $$,
  '23503', 'income category not found', 'an expense category is refused');
select throws_ok(
  $$ select public.add_income('Gift', pg_temp.category('Side income'), 'yearly', '2026-10-01', 10) $$,
  '23514', null, 'an unknown frequency is refused');
select is((select count(*)::int from public.income_sources where name = 'Gift'), 0, 'refused calls add nothing');

-- ===== Act as user B =====
create temp table a_category as select id from public.categories where name = 'Side income';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$ select public.add_income('Gift', (select id from a_category), 'once', '2026-10-01', 10) $$,
  '23503', 'income category not found', 'another user''s category cannot be used');
select is((select count(*)::int from public.income_sources), 0, 'and B has no income');

select * from finish();
rollback;
