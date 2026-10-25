-- Saving a reviewed payslip: the payslip, its lines and one received income entry for the net, in one transaction.
-- Returns the new payslip's id.
--   p_lines: [{label, kind, tag, amount}, ...] as parsed and reviewed.
--   Net goes to the Salary category, or Severance for notice / severance pay.
--   A duplicate (same job, check date and net) is refused (23505) by the payslips unique constraint.
--   A payday that was marked skipped is unskipped: the payslip proves it happened.
create or replace function public.save_payslip(
  p_job_id uuid,
  p_check_date date,
  p_period_start date,
  p_period_end date,
  p_pay_type text,
  p_gross numeric,
  p_net numeric,
  p_reconciled boolean,
  p_parse_method text,
  p_lines jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_id uuid;
  job_name text;
  category uuid;
  category_name text := case when p_pay_type in ('notice', 'severance') then 'Severance' else 'Salary' end;
begin
  if p_net is null or p_net <= 0 then
    raise exception 'net must be more than 0' using errcode = '22023';
  end if;
  -- Row-level security hides other users' jobs, so theirs are "not found".
  select j.name into job_name from public.jobs j where j.id = p_job_id;
  if job_name is null then
    raise exception 'job not found' using errcode = 'P0002';
  end if;
  select c.id into category from public.categories c where c.kind = 'income' and c.name = category_name;
  if category is null then
    select c.id into category from public.categories c where c.kind = 'income' order by c.sort limit 1;
  end if;
  if category is null then
    raise exception 'no income category' using errcode = 'P0002';
  end if;

  insert into public.payslips (job_id, check_date, period_start, period_end, pay_type, gross, net, parse_method, reconciled)
    values (p_job_id, p_check_date, p_period_start, p_period_end, p_pay_type, p_gross, p_net, p_parse_method, coalesce(p_reconciled, false))
    returning id into new_id;
  insert into public.payslip_lines (payslip_id, label, kind, tag, amount)
    select new_id, l.label, l.kind, l.tag, l.amount
    from jsonb_to_recordset(p_lines) as l(label text, kind text, tag text, amount numeric);
  insert into public.transactions (date, kind, amount, name, category_id, payslip_id, source)
    values (p_check_date, 'income', p_net, job_name, category, new_id, 'payslip');
  delete from public.skipped_paydays s where s.job_id = p_job_id and s.pay_date = p_check_date;
  return new_id;
end;
$$;

revoke all on function public.save_payslip(uuid, date, date, date, text, numeric, numeric, boolean, text, jsonb) from public, anon;
grant execute on function public.save_payslip(uuid, date, date, date, text, numeric, numeric, boolean, text, jsonb) to authenticated;
