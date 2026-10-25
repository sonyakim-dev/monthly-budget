begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- A bill's amount changes as text, e.g. 'Oct=30 Dec=0', for easy comparison.
create function pg_temp.bill(p_name text) returns text language sql as $$
  select coalesce(string_agg(to_char(v.effective_month, 'Mon') || '=' || v.amount::int, ' ' order by v.effective_month), '')
  from public.bill_versions v join public.bills b on b.id = v.bill_id where b.name = p_name
$$;
create function pg_temp.bill_id(p_name text) returns uuid language sql as $$ select id from public.bills where name = p_name $$;
create function pg_temp.group_id(p_name text) returns uuid language sql as $$ select id from public.bill_groups where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

-- Bills already in the groups
insert into public.bills (group_id, name, sort) values (pg_temp.group_id('Housing'), 'Rent', 3), (pg_temp.group_id('Subscriptions'), 'Music', 7);

-- A new bill
select is(public.add_bill('Gym', pg_temp.group_id('Housing'), 5, '2026-10-01', 30), false, 'a new name adds a bill');
select is(pg_temp.bill('Gym'), 'Oct=30', 'it repeats every month from the month it was added');
select is((select (due_day, group_id = pg_temp.group_id('Housing'))::text from public.bills where name = 'Gym'), '(5,t)', 'with its group and due day');
select is((select sort from public.bills where name = 'Gym'), 4, 'at the end of its group');

select throws_ok(
  $$ select public.add_bill('Gym', pg_temp.group_id('Housing'), null, '2026-11-01', 40) $$,
  '23505', 'bill already exists', 'a bill still running that month cannot be added again');
select is(pg_temp.bill('Gym'), 'Oct=30', 'and nothing changes');

-- Restarting a stopped bill
select public.set_bill_amount(pg_temp.bill_id('Gym'), '2026-12-01', 0, false);
select is(public.add_bill('Gym', pg_temp.group_id('Subscriptions'), null, '2027-02-01', 35), true, 'a stopped bill''s name restarts it');
select is(pg_temp.bill('Gym'), 'Oct=30 Dec=0 Feb=35', 'from that month on, keeping its history');
select is((select (due_day, group_id = pg_temp.group_id('Subscriptions'))::text from public.bills where name = 'Gym'), '(,t)', 'with the new group and due day');
select is((select count(*)::int from public.bills where name = 'Gym'), 1, 'still one bill');
select is((select sort from public.bills where name = 'Gym'), 8, 'moved to the end of its new group');

select throws_ok(
  $$ select public.add_bill('Gym', pg_temp.group_id('Housing'), null, '2026-11-01', 40) $$,
  '23505', 'bill already exists', 'a month where it was still running is refused too');

-- Skipped for just one month
select public.set_bill_amount(pg_temp.bill_id('Gym'), '2027-04-01', 0, true);
select is(public.add_bill('Gym', pg_temp.group_id('Subscriptions'), null, '2027-04-01', 50), true, 'a skipped month can restart it');
select is(pg_temp.bill('Gym'), 'Oct=30 Dec=0 Feb=35 Apr=50', 'with the new amount from then on');
select is((select sort from public.bills where name = 'Gym'), 8, 'restarting in the same group keeps its place');

-- A stopped bill that was set to start again later
insert into public.bills (group_id, name) values (pg_temp.group_id('Housing'), 'Laundry');
insert into public.bill_versions (bill_id, effective_month, amount) values
  (pg_temp.bill_id('Laundry'), '2026-01-01', 15),
  (pg_temp.bill_id('Laundry'), '2026-03-01', 0),
  (pg_temp.bill_id('Laundry'), '2026-06-01', 20);
select public.add_bill('Laundry', pg_temp.group_id('Housing'), null, '2026-04-01', 18);
select is(pg_temp.bill('Laundry'), 'Jan=15 Mar=0 Apr=18', 'restarting replaces amounts planned for later');

-- One time: just that month
select is(public.add_bill('Repair', pg_temp.group_id('Auto'), null, '2026-10-01', 250, true), false, 'a one-time bill is added');
select is(pg_temp.bill('Repair'), 'Oct=250 Nov=0', 'it is only in that month');
select is(public.add_bill('Repair', pg_temp.group_id('Auto'), null, '2026-12-01', 300, true), true, 'the same name in a later month is the same bill');
select is(pg_temp.bill('Repair'), 'Oct=250 Nov=0 Dec=300 Jan=0', 'with another one-time amount');

-- A bill with no amounts yet
insert into public.bills (group_id, name) values (pg_temp.group_id('Subscriptions'), 'Cloud');
select is(public.add_bill('Cloud', pg_temp.group_id('Subscriptions'), null, '2026-01-01', 3), true, 'a bill with no amounts gets one');
select is(pg_temp.bill('Cloud'), 'Jan=3', 'from that month on');

-- Bad input leaves nothing behind
select throws_ok(
  $$ select public.add_bill('Water', pg_temp.group_id('Housing'), null, '2026-10-15', 10) $$,
  '22023', 'month must be the first of a month', 'the month must be the first of a month');
select throws_ok(
  $$ select public.add_bill('Water', pg_temp.group_id('Housing'), null, '2026-10-01', 0) $$,
  '22023', 'amount must be more than 0', 'the amount must be more than 0');
select is((select count(*)::int from public.bills where name = 'Water'), 0, 'refused calls add no bill');

-- ===== Act as user B =====
create temp table a_groups as select id from public.bill_groups where name = 'Housing';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
select public.seed_defaults();

select throws_ok(
  $$ select public.add_bill('Water', (select id from a_groups), null, '2026-10-01', 10) $$,
  '23503', null, 'another user''s group cannot be used');
select is(public.add_bill('Gym', pg_temp.group_id('Housing'), null, '2026-10-01', 25), false, 'the same name as another user''s bill adds a new bill');

select * from finish();
rollback;
