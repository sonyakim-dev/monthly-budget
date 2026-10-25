-- Reordering bills within a group, and bill groups.
-- One call saves the whole new order in one transaction, so it lands completely or not at all.

-- p_ids: the rows shown, in their new order. They fill the positions those rows had, so a row that isn't
-- shown (a stopped bill, a group with only stopped bills) keeps its place. Then every row in the list is
-- numbered 1, 2, 3… so no two share a position.
create or replace function private.reorder(p_table regclass, p_scope_column text, p_scope uuid, p_ids uuid[], p_label text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_ids uuid[];
  new_ids uuid[];
  next_id int := 1;
begin
  if p_ids is null or cardinality(p_ids) = 0 then
    raise exception 'nothing to reorder' using errcode = '22023';
  end if;
  if (select count(distinct id) from unnest(p_ids) as id) <> cardinality(p_ids) then
    raise exception 'each % can be listed once', p_label using errcode = '22023';
  end if;

  -- Lock the rows (in id order, so two saves can't deadlock), then read their current order.
  execute format('select array_agg(id order by sort, name, id) from (select id, sort, name from %s where %I = $1 order by id for update) t', p_table, p_scope_column)
    into current_ids using p_scope;
  -- Row-level security hides other users' rows, so theirs are "not found".
  if current_ids is null or not (p_ids <@ current_ids) then
    raise exception '% not found', p_label using errcode = 'P0002';
  end if;

  new_ids := current_ids;
  for i in 1 .. cardinality(current_ids) loop
    if current_ids[i] = any (p_ids) then
      new_ids[i] := p_ids[next_id];
      next_id := next_id + 1;
    end if;
  end loop;

  execute format('update %s t set sort = o.position from unnest($1) with ordinality as o(id, position) where t.id = o.id and t.sort <> o.position', p_table)
    using new_ids;
end;
$$;

revoke all on function private.reorder(regclass, text, uuid, uuid[], text) from public, anon;
grant execute on function private.reorder(regclass, text, uuid, uuid[], text) to authenticated;

create or replace function public.reorder_bills(p_group_id uuid, p_bill_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reorder('public.bills', 'group_id', p_group_id, p_bill_ids, 'bill')
$$;

create or replace function public.reorder_bill_groups(p_group_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.reorder('public.bill_groups', 'user_id', (select auth.uid()), p_group_ids, 'bill group')
$$;

revoke all on function public.reorder_bills(uuid, uuid[]) from public, anon;
revoke all on function public.reorder_bill_groups(uuid[]) from public, anon;
grant execute on function public.reorder_bills(uuid, uuid[]) to authenticated;
grant execute on function public.reorder_bill_groups(uuid[]) to authenticated;
