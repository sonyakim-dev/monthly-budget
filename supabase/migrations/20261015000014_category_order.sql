-- Default expense categories in the order they are picked from: food first, then everyday spending,
-- getting around, and the rest. Existing users' defaults are reordered by name; categories they added
-- themselves keep their relative order after the defaults.
update public.categories c
   set sort = o.sort
  from (values
    ('Dining', 1), ('Drinks', 2), ('Groceries', 3), ('Essentials', 4), ('Shopping', 5), ('Personal care', 6),
    ('Rideshare', 7), ('Travel', 8), ('Leisure', 9), ('Gifts', 10), ('Fitness', 11), ('Delivery', 12),
    ('Pharmacy', 13), ('Misc', 14)
  ) as o (name, sort)
 where c.kind = 'expense' and c.name = o.name;

update public.categories c
   set sort = 14 + r.rn
  from (
    select id, row_number() over (partition by user_id order by sort, name) as rn
      from public.categories
     where kind = 'expense'
       and name not in ('Dining', 'Drinks', 'Groceries', 'Essentials', 'Shopping', 'Personal care',
                        'Rideshare', 'Travel', 'Leisure', 'Gifts', 'Fitness', 'Delivery', 'Pharmacy', 'Misc')
  ) as r
 where c.id = r.id;

create or replace function public.seed_defaults()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  i int;
  expense_names text[] := array['Dining', 'Drinks', 'Groceries', 'Essentials', 'Shopping', 'Personal care',
                                'Rideshare', 'Travel', 'Leisure', 'Gifts', 'Fitness', 'Delivery', 'Pharmacy', 'Misc'];
  income_names text[] := array['Salary', 'Unemployment', 'Bonus', 'Severance', 'Side income',
                               'Interest & dividends', 'Tax refund', 'Gift', 'Other income'];
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into settings (user_id) values (uid) on conflict (user_id) do nothing;

  if not exists (select 1 from categories where user_id = uid) then
    for i in 1 .. array_length(expense_names, 1) loop
      insert into categories (user_id, kind, name, sort) values (uid, 'expense', expense_names[i], i);
    end loop;
    for i in 1 .. array_length(income_names, 1) loop
      insert into categories (user_id, kind, name, sort) values (uid, 'income', income_names[i], i);
    end loop;
  end if;

  if not exists (select 1 from bill_groups where user_id = uid) then
    insert into bill_groups (user_id, name, color, sort) values
      (uid, 'Housing', '#f5d76e', 1),
      (uid, 'Auto', '#9ccc9c', 2),
      (uid, 'Subscriptions', '#b9a8e0', 3);
  end if;
end;
$$;
