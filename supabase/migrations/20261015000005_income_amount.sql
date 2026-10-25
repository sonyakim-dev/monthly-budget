-- Changing an income source's amount per payment. Works like set_bill_amount, but income amounts start on a
-- date (a payment can fall on any day), so "a month" here means every payment from its 1st to its last day.
-- One call does the whole change in one transaction, so it either lands completely or not at all.
-- Removing is an amount of 0.
--   only_this_month = true:  payments in p_month get the amount; from the next month the amount goes back to what it
--                            was (unless the next month already starts with its own amount).
--   only_this_month = false: payments from p_month on get the amount; later scheduled changes are replaced.
-- Payments before p_month never change.
create or replace function public.set_income_amount(p_source_id uuid, p_month date, p_amount numeric, p_only_this_month boolean)
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

  -- Lock the income source so two saves at once run one after the other.
  -- Row-level security hides other users' rows, so theirs are "not found".
  select s.id into locked_id from public.income_sources s where s.id = p_source_id for update;
  if locked_id is null then
    raise exception 'income not found' using errcode = 'P0002';
  end if;

  if p_only_this_month then
    -- What the next month would start with before this change.
    select v.amount into old_amount from public.income_source_versions v
      where v.source_id = p_source_id and v.effective_date < next_month
      order by v.effective_date desc limit 1;
    insert into public.income_source_versions (source_id, effective_date, amount)
      values (p_source_id, next_month, coalesce(old_amount, 0))
      on conflict (source_id, effective_date) do nothing;
    -- The whole month gets the one amount.
    delete from public.income_source_versions v
      where v.source_id = p_source_id and v.effective_date > p_month and v.effective_date < next_month;
  else
    delete from public.income_source_versions v where v.source_id = p_source_id and v.effective_date > p_month;
  end if;

  -- One row per start date: update it in place if it exists.
  insert into public.income_source_versions (source_id, effective_date, amount)
    values (p_source_id, p_month, p_amount)
    on conflict (source_id, effective_date) do update set amount = excluded.amount;

  -- Keep only real changes: drop rows that repeat the amount before them, and zeros before the first amount.
  delete from public.income_source_versions v
  using (
    select id, amount, coalesce(lag(amount) over (order by effective_date), 0) as before
    from public.income_source_versions
    where source_id = p_source_id
  ) x
  where v.id = x.id and x.amount = x.before;
end;
$$;

revoke all on function public.set_income_amount(uuid, date, numeric, boolean) from public, anon;
grant execute on function public.set_income_amount(uuid, date, numeric, boolean) to authenticated;
