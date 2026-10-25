begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
insert into public.jobs (name, pay_frequency) values ('Acme', 'biweekly');
create function pg_temp.job() returns uuid language sql as $$ select id from public.jobs where name = 'Acme' $$;
create function pg_temp.entry(d date, tiers jsonb) returns text language sql as $$
  select format($i$ insert into public.job_pay_entries (job_id, effective_date, kind, annual_salary, match_tiers) values (pg_temp.job(), %L, 'start', 100000, %L::jsonb) $i$, d, tiers)
$$;

select hasnt_column('public', 'job_pay_entries', 'match_pct', 'the flat match percentage is gone');

select lives_ok(
  $$ insert into public.job_pay_entries (job_id, effective_date, kind, annual_salary) values (pg_temp.job(), '2026-01-01', 'start', 100000) $$,
  'no match by default');
select is((select match_tiers from public.job_pay_entries where effective_date = '2026-01-01'), '[]'::jsonb, 'the default is no tiers');

select lives_ok(pg_temp.entry('2026-02-01', '[{"match_pct": 100, "of_pct": 6}]'), 'a flat match is one tier');
select lives_ok(pg_temp.entry('2026-03-01', '[{"match_pct": 100, "of_pct": 3}, {"match_pct": 50, "of_pct": 2}]'), 'two tiers');

select throws_ok(pg_temp.entry('2026-04-01', '{"match_pct": 100, "of_pct": 6}'), '23514', null, 'tiers must be a list');
select throws_ok(pg_temp.entry('2026-05-01', '[{"match_pct": 100}]'), '23514', null, 'a tier needs the slice it covers');
select throws_ok(pg_temp.entry('2026-06-01', '[{"match_pct": 150, "of_pct": 6}]'), '23514', null, 'a match rate is at most 100%');

select * from finish();
rollback;
