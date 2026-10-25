begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email)
values ('11111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.seed_defaults();

create function pg_temp.category(p_name text) returns uuid language sql as $$ select id from public.categories where name = p_name $$;
insert into public.income_sources (name, category_id, frequency, start_date)
values ('Benefits', pg_temp.category('Unemployment'), 'weekly', '2026-10-02');
create function pg_temp.edd() returns uuid language sql as $$ select id from public.income_sources where name = 'Benefits' $$;

-- An income entry can say which source it pays
select lives_ok(
  $$ insert into public.transactions (date, kind, amount, category_id, income_source_id) values ('2026-10-02', 'income', 400, pg_temp.category('Unemployment'), pg_temp.edd()) $$,
  'an income entry can be linked to an income source');

-- Other kinds cannot
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, category_id, income_source_id) values ('2026-10-02', 'expense', 5, pg_temp.category('Dining'), pg_temp.edd()) $$,
  '23514', null, 'an expense cannot be linked to an income source');
select throws_ok(
  $$ insert into public.transactions (date, kind, amount, income_source_id) values ('2026-10-02', 'saving', 5, pg_temp.edd()) $$,
  '23514', null, 'a saving cannot be linked to an income source');

-- Deleting the source keeps the payment, unlinked
delete from public.income_sources where name = 'Benefits';
select is(
  (select income_source_id from public.transactions where kind = 'income'), null,
  'deleting the source leaves the payment with no link');

select * from finish();
rollback;
