-- Employer contributions get clearer tags: 'match' becomes '401k_match' and 'hsa_employer' becomes 'hsa_match'.
-- Existing payslip lines are renamed in the same migration, so nothing is lost.
alter table public.payslip_lines drop constraint payslip_lines_tag_check;

update public.payslip_lines set tag = '401k_match' where tag = 'match';
update public.payslip_lines set tag = 'hsa_match' where tag = 'hsa_employer';

alter table public.payslip_lines add constraint payslip_lines_tag_check check (tag in (
  'base', 'allowance', 'notice_pay', 'severance', 'cobra_assist', 'bonus',
  'trad_401k', 'roth_401k', 'hsa',
  'federal', 'state', 'ss', 'medicare', 'sdi',
  '401k_match', 'hsa_match', 'other'));
