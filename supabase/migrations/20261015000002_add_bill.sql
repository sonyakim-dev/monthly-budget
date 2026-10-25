-- Adding a bill, or restarting a stopped one with the same name.
-- One call does it all in one transaction, so it either lands completely or not at all.

-- Adds a bill that repeats every month from p_month, or with p_only_this_month, a one-time bill in p_month only.
-- Returns true when it restarted an existing bill.
-- A new bill goes at the end of its group.
-- A bill with this name that has no amount in p_month (stopped, skipped, or not started) is restarted:
-- it gets the new group and due day, and the amount from p_month on (later planned amounts are replaced),
-- or in p_month only (later planned amounts are kept).
-- It keeps its place in the same group, or goes at the end of a new one.
-- A bill with this name still running in p_month is refused as 'bill already exists' (23505).
create or replace function public.add_bill(p_name text, p_group_id uuid, p_due_day int, p_month date, p_amount numeric, p_only_this_month boolean default false)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_id uuid;
  current_amount numeric;
  end_of_group int := (select coalesce(max(b.sort), 0) + 1 from public.bills b where b.group_id = p_group_id);
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'month must be the first of a month' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be more than 0' using errcode = '22023';
  end if;

  -- A new name: add the bill. Two adds at once wait on the name, so the second one sees the first.
  insert into public.bills (group_id, name, due_day, sort) values (p_group_id, p_name, p_due_day, end_of_group)
  on conflict (user_id, name) do nothing
  returning id into target_id;

  if target_id is not null then
    perform private.set_monthly_amount('public.bills', 'public.bill_versions', 'bill_id', 'bill', target_id, p_month, p_amount, coalesce(p_only_this_month, false));
    return false;
  end if;

  select b.id into target_id from public.bills b where b.user_id = (select auth.uid()) and b.name = p_name for update;
  select v.amount into current_amount from public.bill_versions v
    where v.bill_id = target_id and v.effective_month <= p_month
    order by v.effective_month desc limit 1;
  if coalesce(current_amount, 0) > 0 then
    raise exception 'bill already exists' using errcode = '23505';
  end if;

  update public.bills
  set due_day = p_due_day,
      sort = case when group_id = p_group_id then sort else end_of_group end,
      group_id = p_group_id
  where id = target_id;
  perform private.set_monthly_amount('public.bills', 'public.bill_versions', 'bill_id', 'bill', target_id, p_month, p_amount, coalesce(p_only_this_month, false));
  return true;
end;
$$;

revoke all on function public.add_bill(text, uuid, int, date, numeric, boolean) from public, anon;
grant execute on function public.add_bill(text, uuid, int, date, numeric, boolean) to authenticated;
