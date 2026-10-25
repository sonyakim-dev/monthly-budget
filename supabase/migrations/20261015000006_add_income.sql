-- Adding other income (not a paycheck): the income and its first amount in one transaction,
-- so it either lands completely or not at all. Returns the new income's id.
create or replace function public.add_income(p_name text, p_category_id uuid, p_frequency text, p_start_date date, p_amount numeric)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be more than 0' using errcode = '22023';
  end if;
  if p_start_date is null then
    raise exception 'date is required' using errcode = '22023';
  end if;
  -- Row-level security hides other users' categories, so theirs are "not found" too.
  if not exists (select 1 from public.categories c where c.id = p_category_id and c.kind = 'income') then
    raise exception 'income category not found' using errcode = '23503';
  end if;

  insert into public.income_sources (name, category_id, frequency, start_date)
    values (p_name, p_category_id, p_frequency, p_start_date)
    returning id into new_id;
  insert into public.income_source_versions (source_id, effective_date, amount)
    values (new_id, p_start_date, p_amount);
  return new_id;
end;
$$;

revoke all on function public.add_income(text, uuid, text, date, numeric) from public, anon;
grant execute on function public.add_income(text, uuid, text, date, numeric) to authenticated;
