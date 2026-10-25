-- The default "Coffee" expense category is now "Drinks". Existing users' Coffee categories are renamed
-- too, unless they already have a Drinks category (names are unique per user).
update public.categories c
   set name = 'Drinks'
 where c.kind = 'expense'
   and c.name = 'Coffee'
   and not exists (select 1 from public.categories d where d.user_id = c.user_id and d.name = 'Drinks');

create or replace function public.seed_defaults()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  i int;
  expense_names text[] := array['Groceries', 'Dining', 'Drinks', 'Delivery', 'Rideshare', 'Shopping', 'Essentials',
                                'Leisure', 'Travel', 'Personal care', 'Gifts', 'Pharmacy', 'Fitness', 'Misc'];
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
