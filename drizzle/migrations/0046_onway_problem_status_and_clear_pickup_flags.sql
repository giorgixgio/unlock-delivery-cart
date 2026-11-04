-- Remember which Onway status raised a delivery/pickup problem flag, so the flag can be closed by a later
-- "parcel is in Onway's hands" status no matter what the immediately previous status was.
alter table public.orders add column if not exists onway_problem_status text;
comment on column public.orders.onway_problem_status is 'Onway status name that raised the open delivery/pickup problem flag; decides when the flag may auto-close.';

-- Close the open pickup-cancelled problem flags: Onway has since scanned those parcels (they are picked up / in transit).
update public.orders o set onway_problem_resolved_at = now()
where o.onway_problem_at is not null
  and o.onway_problem_resolved_at is null
  and exists (
    select 1 from public.onway_status_events se
    where se.order_id = o.id
      and se.status_name = 'აღების გაუქმება'
      and se.event_time between o.onway_problem_at - interval '1 minute' and o.onway_problem_at + interval '1 minute'
  );