begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

insert into public.jobs (name, pay_frequency) values ('Acme', 'biweekly');
insert into public.payslips (job_id, check_date, pay_type, gross, net, parse_method)
  select id, '2026-10-02', 'regular', 2000, 1500, 'manual' from public.jobs;
create function pg_temp.line(p_tag text) returns void language sql as $$
  insert into public.payslip_lines (payslip_id, label, kind, tag, amount) select id, p_tag, 'employer', p_tag, 10 from public.payslips
$$;

select lives_ok($$ select pg_temp.line('401k_match') $$, 'employer 401(k) match is tagged 401k_match');
select lives_ok($$ select pg_temp.line('hsa_match') $$, 'employer HSA is tagged hsa_match');
select throws_ok($$ select pg_temp.line('match') $$, '23514', null, 'the old name match is gone');
select throws_ok($$ select pg_temp.line('hsa_employer') $$, '23514', null, 'the old name hsa_employer is gone');

select * from finish();
rollback;
