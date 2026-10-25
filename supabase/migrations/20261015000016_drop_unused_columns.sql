-- Columns nothing reads or writes. Each can come back with a migration when a screen needs it.
alter table public.bills drop column varies;
alter table public.categories drop column archived;
alter table public.job_pay_entries drop column title;
alter table public.settings drop column currency, drop column emergency_target_months, drop column redaction_terms;
alter table public.transactions drop column notes;

-- Entries come from the app, a payslip or the owner's sheet import; 'import' was never written.
alter table public.transactions drop constraint transactions_source_check;
alter table public.transactions add constraint transactions_source_check check (source in ('manual', 'payslip', 'sheet-import'));
