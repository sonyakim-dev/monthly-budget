-- Employer 401(k) match as tiers instead of one flat percentage, so "100% on the first 3%, then 50% on
-- the next 2%" can be said. Each tier: {"match_pct": employer's rate, "of_pct": the slice of the
-- employee's contribution it covers}. A flat match is one tier: 100% of the first N%. The paycheck
-- estimate, the payslip check and the 401(k) helper all use the same rule.
create or replace function public.valid_match_tiers(tiers jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(tiers) = 'array'
    and not exists (
      select 1 from jsonb_array_elements(tiers) t
      -- "is distinct from": a missing key gives null, which must count as invalid, not unknown.
      where jsonb_typeof(t) is distinct from 'object'
         or jsonb_typeof(t -> 'match_pct') is distinct from 'number'
         or jsonb_typeof(t -> 'of_pct') is distinct from 'number'
         or (t ->> 'match_pct')::numeric not between 0 and 100
         or (t ->> 'of_pct')::numeric <= 0
         or (t ->> 'of_pct')::numeric > 100
    )
$$;

alter table public.job_pay_entries
  add column match_tiers jsonb not null default '[]'::jsonb
    constraint job_pay_entries_match_tiers_valid check (public.valid_match_tiers(match_tiers));

update public.job_pay_entries
   set match_tiers = jsonb_build_array(jsonb_build_object('match_pct', 100, 'of_pct', match_pct))
 where match_pct > 0;

alter table public.job_pay_entries drop column match_pct;
