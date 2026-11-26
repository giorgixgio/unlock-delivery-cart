CREATE OR REPLACE FUNCTION public.call_queue_tier(o orders, p_caller text, p_gap_minutes integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 -- SIMPLE MODE (owner request 2026-11-26/27): fresh uncalled first (newest first) -> retries -> callbacks.
 -- Callbacks stay hidden until the time the operator picked (next_call_after); then my callbacks before others'.
 -- Safety rules: open/unconfirmed, not sent/packed/merged/test, not locked by another operator, pending_details 10-min form grace.
 SELECT CASE
 WHEN NOT public.call_queue_is_open(o) THEN NULL
 WHEN public.is_test_order(o.id) OR o.onway_sent_at IS NOT NULL OR o.merged_into_order_id IS NOT NULL OR COALESCE(o.onway_api_status,'') IN ('sent','sending') OR NULLIF(o.tracking_number,'') IS NOT NULL OR NULLIF(o.onway_tracking,'') IS NOT NULL OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL THEN NULL
 WHEN o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
 WHEN o.status = 'pending_details' AND o.created_at > now() - interval '10 minutes' THEN NULL
 WHEN o.call_outcome = 'callback' AND o.next_call_after IS NOT NULL AND o.next_call_after > now() THEN NULL
 WHEN COALESCE(o.call_attempt_count,0) = 0 AND COALESCE(o.call_outcome,'') <> 'callback' THEN 2
 WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
 WHEN o.call_outcome = 'callback' THEN 3
 ELSE 4 END
$function$
;