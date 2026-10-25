-- Names you type are at most 30 characters: entries, bills, bill groups, savings plans, other income, jobs and job titles.
-- (Categories keep their limit; they aren't typed in the app.)
alter table public.transactions drop constraint transactions_name_check,
  add constraint transactions_name_check check (name is null or length(name) <= 30);
alter table public.bills drop constraint bills_name_check,
  add constraint bills_name_check check (length(name) between 1 and 30);
alter table public.bill_groups drop constraint bill_groups_name_check,
  add constraint bill_groups_name_check check (length(name) between 1 and 30);
alter table public.savings_plans drop constraint savings_plans_name_check,
  add constraint savings_plans_name_check check (length(name) between 1 and 30);
alter table public.income_sources drop constraint income_sources_name_check,
  add constraint income_sources_name_check check (length(name) between 1 and 30);
alter table public.jobs drop constraint jobs_name_check,
  add constraint jobs_name_check check (length(name) between 1 and 30);
alter table public.job_pay_entries drop constraint job_pay_entries_title_check,
  add constraint job_pay_entries_title_check check (title is null or length(title) <= 30);
