begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();
insert into public.income_sources (name, category_id, frequency, start_date)
select 'EDD', id, 'weekly', '2026-05-09' from public.categories where name = 'Unemployment';
create function pg_temp.source() returns uuid language sql as $$ select id from public.income_sources where name = 'EDD' $$;

select lives_ok($$ insert into public.skipped_income (source_id, pay_date) values (pg_temp.source(), '2026-09-15') $$, 'a payment can be skipped');
select throws_ok($$ insert into public.skipped_income (source_id, pay_date) values (pg_temp.source(), '2026-09-15') $$, '23505', null, 'only once per source and date');
select lives_ok($$ delete from public.skipped_income where source_id = pg_temp.source() and pay_date = '2026-09-15' $$, 'and unskipped');
insert into public.skipped_income (source_id, pay_date) values (pg_temp.source(), '2026-09-22');

-- B cannot see or use A's income source
create temp table a_source as select pg_temp.source() as id;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.skipped_income), 0, 'another user sees no skipped payments');
select throws_ok($$ insert into public.skipped_income (source_id, pay_date) values ((select id from a_source), '2026-09-29') $$, '23503', null, 'and cannot skip a payment of a source that is not theirs');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.skipped_income), 1, 'A still has one skipped payment');

select * from finish();
rollback;
