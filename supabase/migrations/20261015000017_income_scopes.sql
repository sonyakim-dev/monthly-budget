-- Other income is paid weekly, biweekly, monthly or once, so its amount changes by payment date, not by month:
--   all:   one amount for every payment, from the first one
--   later: this payment and the ones after it
-- (A single payment is changed by recording it as an entry, and skipped with skipped_income.)
drop function public.set_income_amount(uuid, date, numeric, boolean);

create or replace function public.set_income_amount(p_source_id uuid, p_from date, p_amount numeric, p_scope text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.income_sources%rowtype;
  from_date date;
begin
  if p_scope not in ('all', 'later') then
    raise exception 'scope must be all or later' using errcode = '22023';
  end if;
  if p_amount is null or p_amount < 0 then
    raise exception 'amount must be 0 or more' using errcode = '22023';
  end if;
  if p_from is null then
    raise exception 'date is required' using errcode = '22023';
  end if;

  -- Lock the income source so two saves at once run one after the other.
  -- Row-level security hides other users' rows, so theirs are "not found".
  select * into src from public.income_sources s where s.id = p_source_id for update;
  if src.id is null then
    raise exception 'income not found' using errcode = 'P0002';
  end if;

  from_date := case when p_scope = 'all' then src.start_date else p_from end;
  delete from public.income_source_versions v where v.source_id = p_source_id and v.effective_date > from_date;
  if p_scope = 'all' then
    delete from public.income_source_versions v where v.source_id = p_source_id;
  end if;

  -- One row per start date: update it in place if it exists.
  insert into public.income_source_versions (source_id, effective_date, amount)
    values (p_source_id, from_date, p_amount)
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

revoke all on function public.set_income_amount(uuid, date, numeric, text) from public, anon;
grant execute on function public.set_income_amount(uuid, date, numeric, text) to authenticated;
