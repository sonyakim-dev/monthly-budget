begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();
insert into public.jobs (name, pay_frequency) values ('Example Corp', 'biweekly');
create function pg_temp.job() returns uuid language sql as $$ select id from public.jobs where name = 'Example Corp' $$;
create function pg_temp.lines() returns jsonb language sql as $$
  select '[{"label":"Regular Pay","kind":"earning","tag":"base","amount":4000},
          {"label":"OASDI","kind":"tax","tag":"ss","amount":240},
          {"label":"401k","kind":"pretax","tag":"trad_401k","amount":400},
          {"label":"401k Match","kind":"employer","tag":"401k_match","amount":160}]'::jsonb
$$;

-- A payday skipped earlier; the payslip proves it happened.
insert into public.skipped_paydays (job_id, pay_date) values (pg_temp.job(), '2026-04-10');

select lives_ok(
  $$ select public.save_payslip(pg_temp.job(), '2026-04-10', '2026-03-22', '2026-04-04', 'regular', 4000, 3360, true, 'workday', pg_temp.lines()) $$,
  'a payslip is saved');
select is((select count(*)::int from public.payslips), 1, 'one payslip row');
select is((select count(*)::int from public.payslip_lines), 4, 'with its lines');
select is(
  (select (t.kind, t.amount, t.date, t.source, c.name)::text from public.transactions t join public.categories c on c.id = t.category_id),
  '(income,3360.00,2026-04-10,payslip,Salary)',
  'and one received income entry for the net, on the check date, in Salary');
select is((select t.payslip_id = p.id from public.transactions t, public.payslips p), true, 'linked to the payslip');
select is((select count(*)::int from public.skipped_paydays), 0, 'the payday is no longer skipped');

-- Duplicates: same job, check date and net
select throws_ok(
  $$ select public.save_payslip(pg_temp.job(), '2026-04-10', null, null, 'regular', 4000, 3360, true, 'workday', pg_temp.lines()) $$,
  '23505', null, 'the same payslip again is refused');
select is((select count(*)::int from public.transactions), 1, 'and nothing extra is written');

-- Severance goes to the Severance category
select public.save_payslip(pg_temp.job(), '2026-05-01', null, null, 'severance', 9000, 6140, true, 'workday', '[{"label":"Severance","kind":"earning","tag":"severance","amount":9000}]'::jsonb);
select is((select c.name from public.transactions t join public.categories c on c.id = t.category_id where t.date = '2026-05-01'), 'Severance', 'severance pay lands in Severance');

-- Bad input leaves nothing behind
select throws_ok(
  $$ select public.save_payslip(pg_temp.job(), '2026-06-01', null, null, 'regular', 1000, 0, true, 'workday', pg_temp.lines()) $$,
  '22023', 'net must be more than 0', 'net must be more than 0');
select throws_ok(
  $$ select public.save_payslip(pg_temp.job(), '2026-06-01', null, null, 'regular', 1000, 900, true, 'workday', '[{"label":"X","kind":"earning","tag":"nope","amount":1}]'::jsonb) $$,
  '23514', null, 'an unknown tag is refused');
select is((select count(*)::int from public.payslips), 2, 'refused calls add no payslip');

-- Another user cannot use A's job
create temp table a_job as select pg_temp.job() as id;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select public.seed_defaults();
select throws_ok(
  $$ select public.save_payslip((select id from a_job), '2026-04-10', null, null, 'regular', 4000, 3360, true, 'workday', pg_temp.lines()) $$,
  'P0002', 'job not found', 'another user''s job is not found');
select is((select count(*)::int from public.payslips), 0, 'and B has nothing');

select * from finish();
rollback;
