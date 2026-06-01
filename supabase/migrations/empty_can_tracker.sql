-- =============================================
-- EMPTY CAN TRACKER — Migration
-- Run in Supabase SQL Editor
-- =============================================
-- NOTE: This uses actual DB column names from code:
--   deliveries.date         (not delivered_at)
--   deliveries.delivered    (not cans_delivered)
--   deliveries.empty_collected (not empty_cans_collected)
-- =============================================

-- Clean up if re-running
drop view if exists empty_can_alerts cascade;
drop view if exists empty_can_status cascade;
drop function if exists get_customer_empty_status(uuid);
drop function if exists get_empty_can_summary();
drop function if exists record_empty_collection(uuid, integer, text);

-- ─────────────────────────────────────────
-- VIEW: empty_can_status
-- All active customers with outstanding empties
-- ─────────────────────────────────────────
create or replace view empty_can_status as
select
  c.id                          as customer_id,
  c.name,
  c.phone,
  c.area,
  c.empty_balance,
  (
    select max(d.date)
    from deliveries d
    where d.customer_id = c.id
  )                             as last_delivery_date,
  (current_date - coalesce(
    (select max(d.date) from deliveries d where d.customer_id = c.id),
    c.created_at::date
  ))                            as days_outstanding,
  case
    when c.empty_balance > 0
      and (current_date - coalesce(
        (select max(d.date) from deliveries d where d.customer_id = c.id),
        c.created_at::date
      )) > 5
    then 'critical'
    when c.empty_balance > 0
      and (current_date - coalesce(
        (select max(d.date) from deliveries d where d.customer_id = c.id),
        c.created_at::date
      )) between 3 and 5
    then 'warning'
    when c.empty_balance > 0
    then 'watch'
    else 'ok'
  end                           as severity
from customers c
where c.active = true;

-- ─────────────────────────────────────────
-- VIEW: empty_can_alerts
-- Only customers needing attention, sorted by urgency
-- ─────────────────────────────────────────
create or replace view empty_can_alerts as
select * from empty_can_status
where severity in ('watch', 'warning', 'critical')
order by
  case severity
    when 'critical' then 1
    when 'warning'  then 2
    when 'watch'    then 3
  end,
  empty_balance desc;

-- ─────────────────────────────────────────
-- RPC: get_customer_empty_status
-- Single-customer lookup for delivery boy
-- ─────────────────────────────────────────
create or replace function get_customer_empty_status(p_customer_id uuid)
returns table(
  customer_id       uuid,
  name              text,
  phone             text,
  area              text,
  empty_balance     integer,
  last_delivery_date date,
  days_outstanding  integer,
  severity          text
)
language sql stable security definer
as $$
  select
    c.id,
    c.name,
    c.phone,
    c.area,
    c.empty_balance,
    (select max(d.date) from deliveries d where d.customer_id = c.id),
    (current_date - coalesce(
      (select max(d.date) from deliveries d where d.customer_id = c.id),
      c.created_at::date
    ))::integer,
    case
      when c.empty_balance > 0
        and (current_date - coalesce(
          (select max(d.date) from deliveries d where d.customer_id = c.id),
          c.created_at::date
        )) > 5
      then 'critical'
      when c.empty_balance > 0
        and (current_date - coalesce(
          (select max(d.date) from deliveries d where d.customer_id = c.id),
          c.created_at::date
        )) between 3 and 5
      then 'warning'
      when c.empty_balance > 0
      then 'watch'
      else 'ok'
    end
  from customers c
  where c.id = p_customer_id
    and c.active = true;
$$;

-- ─────────────────────────────────────────
-- RPC: get_empty_can_summary
-- Summary stats for admin dashboard
-- ─────────────────────────────────────────
create or replace function get_empty_can_summary()
returns table(
  total_overdue  integer,
  total_cans     bigint,
  critical_count integer,
  warning_count  integer,
  watch_count    integer
)
language sql stable security definer
as $$
  select
    count(*)::integer,
    coalesce(sum(empty_balance), 0)::bigint,
    count(*) filter (where severity = 'critical')::integer,
    count(*) filter (where severity = 'warning')::integer,
    count(*) filter (where severity = 'watch')::integer
  from empty_can_alerts;
$$;

-- ─────────────────────────────────────────
-- RPC: record_empty_collection
-- Admin or delivery boy records manual empty return
-- ─────────────────────────────────────────
create or replace function record_empty_collection(
  p_customer_id uuid,
  p_qty         integer,
  p_notes       text default null
)
returns json
language plpgsql security definer
as $$
declare
  v_balance     integer;
  v_new_balance integer;
begin
  select empty_balance into v_balance
  from customers
  where id = p_customer_id
  for update;

  if not found then
    return json_build_object('success', false, 'error', 'Customer not found');
  end if;

  v_new_balance := greatest(0, coalesce(v_balance, 0) - p_qty);

  update customers
  set empty_balance = v_new_balance
  where id = p_customer_id;

  return json_build_object('success', true, 'new_balance', v_new_balance);
end;
$$;

-- ─────────────────────────────────────────
-- GRANTS
-- ─────────────────────────────────────────
grant select on empty_can_status  to authenticated;
grant select on empty_can_alerts  to authenticated;
grant execute on function get_customer_empty_status(uuid)                     to authenticated;
grant execute on function get_empty_can_summary()                             to authenticated;
grant execute on function record_empty_collection(uuid, integer, text)        to authenticated;

-- ─────────────────────────────────────────
-- TRIGGER (optional — replaces manual empty_balance update in code)
-- If you enable this, remove the manual customers.update({ empty_balance })
-- calls in DeliveryBoy.jsx and Deliveries.jsx to avoid double-counting.
-- ─────────────────────────────────────────
-- create or replace function trg_sync_empty_balance()
-- returns trigger language plpgsql security definer as $$
-- begin
--   update customers
--   set empty_balance = greatest(0,
--     coalesce(empty_balance, 0) + new.delivered - coalesce(new.empty_collected, 0)
--   )
--   where id = new.customer_id;
--   return new;
-- end;
-- $$;
--
-- drop trigger if exists trg_sync_empty_balance on deliveries;
-- create trigger trg_sync_empty_balance
-- after insert on deliveries
-- for each row execute function trg_sync_empty_balance();
