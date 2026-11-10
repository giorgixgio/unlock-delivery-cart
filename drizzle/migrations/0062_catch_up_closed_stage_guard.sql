CREATE OR REPLACE FUNCTION public.call_queue_tier(o orders, p_caller text, p_gap_minutes integer)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
 SELECT CASE
 WHEN (public.call_queue_cfg()).catch_up_enabled AND (public.is_test_order(o.id) OR o.onway_sent_at IS NOT NULL OR o.merged_into_order_id IS NOT NULL OR COALESCE(o.onway_api_status,'') IN ('sent','sending') OR NULLIF(o.tracking_number,'') IS NOT NULL OR NULLIF(o.onway_tracking,'') IS NOT NULL OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL) THEN NULL
 WHEN (public.call_queue_cfg()).catch_up_enabled AND COALESCE(o.call_outcome,'') <> 'callback' THEN
 CASE WHEN NOT public.call_queue_is_open(o)
 OR (o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller))
 OR o.last_call_attempt_at > now() - make_interval(mins => (public.call_queue_cfg()).catch_up_gap_minutes)
 THEN NULL WHEN COALESCE(o.call_attempt_count,0) = 0 THEN 2 ELSE 4 END
 WHEN NOT public.call_queue_is_open(o) THEN NULL
 WHEN o.status = 'pending_details' AND o.created_at > now() - interval '10 minutes' THEN NULL
 WHEN o.next_call_after IS NOT NULL AND o.next_call_after > now() THEN NULL
 WHEN o.queue_locked_until IS NOT NULL AND o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
 WHEN public.call_queue_night_held(o, now()) THEN NULL
 WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
 WHEN COALESCE(o.call_attempt_count, 0) = 0 AND COALESCE(o.call_outcome, '') <> 'callback' THEN 2
 WHEN o.call_outcome = 'callback' THEN CASE WHEN o.queue_last_touched_by IS NULL OR o.next_call_after IS NULL OR o.next_call_after <= now() - interval '30 minutes' OR NOT public.call_queue_on_shift(o.queue_last_touched_by) THEN 3 ELSE NULL END
 WHEN o.next_call_after IS NULL AND o.last_call_attempt_at IS NOT NULL AND o.last_call_attempt_at > now() - make_interval(mins => p_gap_minutes) THEN NULL
 ELSE 4 END
$function$;