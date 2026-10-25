-- An income entry can say which income source (other income, not a paycheck) it is a payment of.
-- Home then shows the payment instead of that source's planned occurrence. Before this, the match
-- went by category and date, so one payment could hide another source's occurrence.
alter table public.transactions
  add column income_source_id uuid,
  add foreign key (income_source_id, user_id) references public.income_sources (id, user_id) on delete set null (income_source_id),
  drop constraint transactions_links,
  add constraint transactions_links check (
    case kind
      when 'income'  then category_id is not null and bill_id is null and savings_plan_id is null
      when 'expense' then category_id is not null and bill_id is null and savings_plan_id is null and payslip_id is null and income_source_id is null
      when 'bill'    then bill_id is not null and category_id is null and savings_plan_id is null and payslip_id is null and income_source_id is null
      when 'saving'  then category_id is null and bill_id is null and payslip_id is null and income_source_id is null
    end
  );
