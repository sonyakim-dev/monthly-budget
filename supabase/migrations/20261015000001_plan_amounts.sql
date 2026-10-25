-- Changing a bill's or savings plan's monthly amount.
-- One call does the whole change in one transaction, so it either lands completely or not at all.
-- Stopping is an amount of 0.

create schema if not exists private;
grant usage on schema private to authenticated;

-- Shared by bills and savings plans: their version tables have the same shape apart from the key column.
--   only_this_month = true:  the amount applies to p_month only; the next month goes back to the amount
--                            before (unless the next month already has its own amount).
--   only_this_month = false: the amount applies from p_month on; later scheduled changes are replaced.
-- Months before p_month never change.
create or replace function private.set_monthly_amount(
  p_parent regclass,
  p_versions regclass,
  p_key text,
  p_label text,
  p_id uuid,
  p_month date,
  p_amount numeric,
  p_only_this_month boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_month date := (p_month + interval '1 month')::date;
  locked_id uuid;
  old_amount numeric;
begin
  if p_month is null or p_month <> date_trunc('month', p_month)::date then
    raise exception 'month must be the first of a month' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be 0 or more' using errcode = '22023';
  end if;

  -- Lock the bill or plan so two saves at once run one after the other.
  -- Row-level security hides other users' rows, so theirs are "not found".
  execute format('select id from %s where id = $1 for update', p_parent) into locked_id using p_id;
  if locked_id is null then
    raise exception '% not found', p_label using errcode = 'P0002';
  end if;

  if p_only_this_month then
    execute format('select amount from %s where %I = $1 and effective_month <= $2 order by effective_month desc limit 1', p_versions, p_key)
      into old_amount using p_id, p_month;
    execute format('insert into %s (%I, effective_month, amount) values ($1, $2, $3) on conflict (%I, effective_month) do nothing', p_versions, p_key, p_key)
      using p_id, next_month, coalesce(old_amount, 0);
  else
    execute format('delete from %s where %I = $1 and effective_month > $2', p_versions, p_key) using p_id, p_month;
  end if;

  -- One row per month: update it in place if it exists.
  execute format('insert into %s (%I, effective_month, amount) values ($1, $2, $3) on conflict (%I, effective_month) do update set amount = excluded.amount', p_versions, p_key, p_key)
    using p_id, p_month, p_amount;

  -- Keep only real changes: drop rows that repeat the amount before them, and zeros before the first amount.
  execute format($q$
    delete from %1$s v
    using (
      select id, amount, coalesce(lag(amount) over (order by effective_month), 0) as before
      from %1$s
      where %2$I = $1
    ) x
    where v.id = x.id and x.amount = x.before
  $q$, p_versions, p_key) using p_id;
end;
$$;

revoke all on function private.set_monthly_amount(regclass, regclass, text, text, uuid, date, numeric, boolean) from public, anon;
grant execute on function private.set_monthly_amount(regclass, regclass, text, text, uuid, date, numeric, boolean) to authenticated;

create or replace function public.set_bill_amount(p_bill_id uuid, p_month date, p_amount numeric, p_only_this_month boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_monthly_amount('public.bills', 'public.bill_versions', 'bill_id', 'bill', p_bill_id, p_month, p_amount, p_only_this_month)
$$;

create or replace function public.set_savings_amount(p_plan_id uuid, p_month date, p_amount numeric, p_only_this_month boolean)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_monthly_amount('public.savings_plans', 'public.savings_plan_versions', 'plan_id', 'savings plan', p_plan_id, p_month, p_amount, p_only_this_month)
$$;

revoke all on function public.set_bill_amount(uuid, date, numeric, boolean) from public, anon;
revoke all on function public.set_savings_amount(uuid, date, numeric, boolean) from public, anon;
grant execute on function public.set_bill_amount(uuid, date, numeric, boolean) to authenticated;
grant execute on function public.set_savings_amount(uuid, date, numeric, boolean) to authenticated;
