-- Adding a savings plan, or restarting a removed one with the same name. Works like add_bill.
-- One call does it all in one transaction, so it either lands completely or not at all.

-- Adds a savings plan that repeats every month from p_month, or with p_only_this_month, a one-time saving in p_month only.
-- Returns true when it restarted an existing plan.
-- A new plan goes at the end of the list.
-- A plan with this name that has no amount in p_month (removed, skipped, or not started) is restarted:
-- it gets the new day, and the amount from p_month on (later planned amounts are replaced),
-- or in p_month only (later planned amounts are kept). It keeps its place in the list.
-- A plan with this name still running in p_month is refused as 'savings plan already exists' (23505).
create or replace function public.add_savings_plan(p_name text, p_day int, p_month date, p_amount numeric, p_only_this_month boolean default false)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_id uuid;
  current_amount numeric;
  end_of_list int := (select coalesce(max(p.sort), 0) + 1 from public.savings_plans p);
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'month must be the first of a month' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be more than 0' using errcode = '22023';
  end if;

  -- A new name: add the plan. Two adds at once wait on the name, so the second one sees the first.
  insert into public.savings_plans (name, day_of_month, sort) values (p_name, p_day, end_of_list)
  on conflict (user_id, name) do nothing
  returning id into target_id;

  if target_id is not null then
    perform private.set_monthly_amount('public.savings_plans', 'public.savings_plan_versions', 'plan_id', 'savings plan', target_id, p_month, p_amount, coalesce(p_only_this_month, false));
    return false;
  end if;

  select p.id into target_id from public.savings_plans p where p.user_id = (select auth.uid()) and p.name = p_name for update;
  select v.amount into current_amount from public.savings_plan_versions v
    where v.plan_id = target_id and v.effective_month <= p_month
    order by v.effective_month desc limit 1;
  if coalesce(current_amount, 0) > 0 then
    raise exception 'savings plan already exists' using errcode = '23505';
  end if;

  update public.savings_plans set day_of_month = p_day where id = target_id;
  perform private.set_monthly_amount('public.savings_plans', 'public.savings_plan_versions', 'plan_id', 'savings plan', target_id, p_month, p_amount, coalesce(p_only_this_month, false));
  return true;
end;
$$;

revoke all on function public.add_savings_plan(text, int, date, numeric, boolean) from public, anon;
grant execute on function public.add_savings_plan(text, int, date, numeric, boolean) to authenticated;
