begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('22222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- The order as text, e.g. 'Rent Old Internet', and the positions, e.g. '1 2 3'.
create function pg_temp.bills(p_group text) returns text language sql as $$
  select string_agg(b.name, ' ' order by b.sort, b.name) from public.bills b join public.bill_groups g on g.id = b.group_id where g.name = p_group
$$;
create function pg_temp.positions(p_group text) returns text language sql as $$
  select string_agg(b.sort::text, ' ' order by b.sort, b.name) from public.bills b join public.bill_groups g on g.id = b.group_id where g.name = p_group
$$;
create function pg_temp.groups() returns text language sql as $$
  select string_agg(name, ' ' order by sort, name) from public.bill_groups
$$;
create function pg_temp.bill_ids(p_names text[]) returns uuid[] language sql as $$
  select array_agg(b.id order by array_position(p_names, b.name)) from public.bills b where b.name = any(p_names)
$$;
create function pg_temp.group_ids(p_names text[]) returns uuid[] language sql as $$
  select array_agg(g.id order by array_position(p_names, g.name)) from public.bill_groups g where g.name = any(p_names)
$$;
create function pg_temp.group_id(p_name text) returns uuid language sql as $$ select id from public.bill_groups where name = p_name $$;

-- ===== Act as user A =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults(); -- Housing, Auto, Subscriptions

insert into public.bills (group_id, name, sort) values
  (pg_temp.group_id('Housing'), 'Rent', 5),
  (pg_temp.group_id('Housing'), 'Old', 6),       -- stopped: not shown, so not in the lists below
  (pg_temp.group_id('Housing'), 'Internet', 9),
  (pg_temp.group_id('Housing'), 'Power', 9),
  (pg_temp.group_id('Auto'), 'Fuel', 1);

-- Bills
select public.reorder_bills(pg_temp.group_id('Housing'), pg_temp.bill_ids(array['Internet', 'Rent', 'Power']));
select is(pg_temp.bills('Housing'), 'Internet Old Rent Power', 'the shown bills take the new order; a hidden bill keeps its place');
select is(pg_temp.positions('Housing'), '1 2 3 4', 'positions are numbered 1, 2, 3…');

select public.reorder_bills(pg_temp.group_id('Housing'), pg_temp.bill_ids(array['Internet', 'Rent', 'Power']));
select is(pg_temp.bills('Housing') || ' / ' || pg_temp.positions('Housing'), 'Internet Old Rent Power / 1 2 3 4', 'the same order again changes nothing');

select throws_ok(
  $$ select public.reorder_bills(pg_temp.group_id('Housing'), pg_temp.bill_ids(array['Rent', 'Fuel'])) $$,
  'P0002', 'bill not found', 'a bill from another group is refused');
select throws_ok(
  $$ select public.reorder_bills(pg_temp.group_id('Housing'), array[(pg_temp.bill_ids(array['Rent']))[1], (pg_temp.bill_ids(array['Rent']))[1]]) $$,
  '22023', 'each bill can be listed once', 'a bill listed twice is refused');
select throws_ok(
  $$ select public.reorder_bills(pg_temp.group_id('Housing'), array[]::uuid[]) $$,
  '22023', 'nothing to reorder', 'an empty list is refused');

-- Groups
select public.reorder_bill_groups(pg_temp.group_ids(array['Subscriptions', 'Housing', 'Auto']));
select is(pg_temp.groups(), 'Subscriptions Housing Auto', 'groups take the new order');

select public.reorder_bill_groups(pg_temp.group_ids(array['Auto', 'Housing']));
select is(pg_temp.groups(), 'Subscriptions Auto Housing', 'a hidden group keeps its place');

-- ===== Act as user B: A's rows are invisible =====
create temp table a_ids as
  select 'group' as kind, id from public.bill_groups where name = 'Housing'
  union all select 'bill', id from public.bills where name = 'Rent';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);

select throws_ok(
  $$ select public.reorder_bills((select id from a_ids where kind = 'group'), array[(select id from a_ids where kind = 'bill')]) $$,
  'P0002', 'bill not found', 'another user''s bills cannot be reordered');
select throws_ok(
  $$ select public.reorder_bill_groups(array[(select id from a_ids where kind = 'group')]) $$,
  'P0002', 'bill group not found', 'another user''s groups cannot be reordered');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select is(pg_temp.bills('Housing') || ' / ' || pg_temp.groups(), 'Internet Old Rent Power / Subscriptions Auto Housing', 'A''s order is unchanged');

select * from finish();
rollback;
