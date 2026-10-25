begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into public.jobs (name, pay_frequency) values ('Acme', 'biweekly');
create function pg_temp.job() returns uuid language sql as $$ select id from public.jobs where name = 'Acme' $$;

select lives_ok($$ insert into public.skipped_paydays (job_id, pay_date) values (pg_temp.job(), '2026-10-02') $$, 'a payday can be skipped');
select throws_ok($$ insert into public.skipped_paydays (job_id, pay_date) values (pg_temp.job(), '2026-10-02') $$, '23505', null, 'only once per job and date');
select lives_ok($$ delete from public.skipped_paydays where job_id = pg_temp.job() and pay_date = '2026-10-02' $$, 'and unskipped');
insert into public.skipped_paydays (job_id, pay_date) values (pg_temp.job(), '2026-10-16');

-- B cannot see or use A's job
create temp table a_job as select pg_temp.job() as id;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select is((select count(*)::int from public.skipped_paydays), 0, 'another user sees no skipped paydays');
select throws_ok($$ insert into public.skipped_paydays (job_id, pay_date) values ((select id from a_job), '2026-11-01') $$, '23503', null, 'and cannot skip a payday of a job that is not theirs');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is((select count(*)::int from public.skipped_paydays), 1, 'A still has one skipped payday');

select * from finish();
rollback;
