begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

create function pg_temp.name(n int) returns text language sql as $$ select repeat('x', n) $$;
create function pg_temp.group_id() returns uuid language sql as $$ select id from public.bill_groups order by sort limit 1 $$;
create function pg_temp.category(p_kind text) returns uuid language sql as $$ select id from public.categories where kind = p_kind order by sort limit 1 $$;

-- 30 characters is fine
select lives_ok(
  $$ insert into public.bills (group_id, name) values (pg_temp.group_id(), pg_temp.name(30)) $$,
  'a 30-character name is fine');

-- 31 characters is refused everywhere a name is typed
select throws_ok($$ insert into public.bills (group_id, name) values (pg_temp.group_id(), pg_temp.name(31)) $$,
  '23514', null, 'bill names are at most 30 characters');
select throws_ok($$ insert into public.bill_groups (name) values (pg_temp.name(31)) $$,
  '23514', null, 'bill group names are at most 30 characters');
select throws_ok($$ insert into public.savings_plans (name) values (pg_temp.name(31)) $$,
  '23514', null, 'savings plan names are at most 30 characters');
select throws_ok(
  $$ insert into public.income_sources (name, category_id, frequency, start_date) values (pg_temp.name(31), pg_temp.category('income'), 'once', '2026-10-01') $$,
  '23514', null, 'income names are at most 30 characters');
select throws_ok($$ insert into public.jobs (name, pay_frequency) values (pg_temp.name(31), 'monthly') $$,
  '23514', null, 'job names are at most 30 characters');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, name, category_id) values ('2026-10-01', 'expense', 5, pg_temp.name(31), pg_temp.category('expense')) $$,
  '23514', null, 'entry names are at most 30 characters');

-- An entry still doesn't need a name
select lives_ok(
  $$ insert into public.transactions (date, kind, amount, name, category_id) values ('2026-10-01', 'expense', 5, null, pg_temp.category('expense')) $$,
  'an entry without a name is fine');

select * from finish();
rollback;
