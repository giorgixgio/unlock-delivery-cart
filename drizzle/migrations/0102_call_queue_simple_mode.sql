CREATE OR REPLACE FUNCTION public.call_queue_tier(o orders, p_caller text, p_gap_minutes integer)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
 -- SIMPLE MODE (2026-11-26, owner request): no date cutoff, no night hold, no due-time hold, no sticky callbacks, no retry gap.
 -- Order (in call_queue_next): fresh uncalled (newest first) -> retries -> my callbacks -> other callbacks.
 -- Only safety rules remain: open/unconfirmed, not sent/packed/merged/test, not locked by another operator, pending_details 10-min form grace.
 SELECT CASE
 WHEN NOT public.call_queue_is_open(o) THEN NULL
 WHEN public.is_test_order(o.id) OR o.onway_sent_at IS NOT NULL OR o.merged_into_order_id IS NOT NULL OR COALESCE(o.onway_api_status,'') IN ('sent','sending') OR NULLIF(o.tracking_number,'') IS NOT NULL OR NULLIF(o.onway_tracking,'') IS NOT NULL OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL THEN NULL
 WHEN o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
 WHEN o.status = 'pending_details' AND o.created_at > now() - interval '10 minutes' THEN NULL
 WHEN COALESCE(o.call_attempt_count,0) = 0 AND COALESCE(o.call_outcome,'') <> 'callback' THEN 2
 WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
 WHEN o.call_outcome = 'callback' THEN 3
 ELSE 4 END
$function$;

-- Preserve the live selector verbatim except its empty-result response. SKIP LOCKED
-- may skip transient row locks even when the operator still has eligible work.
DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.call_queue_next(text)'::regprocedure);
  old_response text := $old$IF v_id IS NULL THEN RETURN jsonb_build_object('order_id',NULL); END IF;$old$;
  new_response text := $new$IF v_id IS NULL THEN
    RETURN jsonb_build_object('order_id',NULL,'eligible_count',(
      SELECT count(*) FROM public.orders o
      WHERE o.status IN ('new','on_hold','pending_bump','pending_details')
        AND public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) IS NOT NULL
        AND public.call_queue_store_match(o.id,p_store)
    ));
  END IF;$new$;
BEGIN
  IF strpos(definition,old_response)=0 THEN
    RAISE EXCEPTION 'Expected call_queue_next empty-result branch not found; selector was not changed';
  END IF;
  EXECUTE replace(definition,old_response,new_response);
END
$migration$;