DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['call_queue_is_open','call_queue_next','call_queue_stats','call_queue_team_locks','call_queue_undo'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f;
    IF d IS NULL OR position('pending_details' in d) > 0 THEN CONTINUE; END IF;
    d := replace(d, $q$('new','on_hold','pending_bump','confirmed')$q$, $q$('new','on_hold','pending_bump','pending_details','confirmed')$q$);
    d := replace(d, $q$('new','on_hold','pending_bump')$q$, $q$('new','on_hold','pending_bump','pending_details')$q$);
    EXECUTE d;
  END LOOP;
END $$;

-- Phone-only leads wait 10 minutes so the customer can finish entering the address first.
CREATE OR REPLACE FUNCTION public.call_queue_tier(o orders, p_caller text, p_gap_minutes integer)
 RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NOT public.call_queue_is_open(o) THEN NULL
    WHEN o.status = 'pending_details' AND o.created_at > now() - interval '10 minutes' THEN NULL
    WHEN o.next_call_after IS NOT NULL AND o.next_call_after > now() THEN NULL
    WHEN o.queue_locked_until IS NOT NULL AND o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
    WHEN public.call_queue_night_held(o, now()) THEN NULL
    WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
    WHEN COALESCE(o.call_attempt_count, 0) = 0 AND COALESCE(o.call_outcome, '') <> 'callback' THEN 2
    WHEN o.call_outcome = 'callback' THEN
      CASE WHEN o.queue_last_touched_by IS NULL OR o.next_call_after IS NULL
             OR o.next_call_after <= now() - interval '30 minutes'
             OR NOT public.call_queue_on_shift(o.queue_last_touched_by) THEN 3 ELSE NULL END
    WHEN o.next_call_after IS NULL AND o.last_call_attempt_at IS NOT NULL AND o.last_call_attempt_at > now() - make_interval(mins => p_gap_minutes) THEN NULL
    ELSE 4
  END
$function$;

CREATE INDEX IF NOT EXISTS orders_call_queue_open_idx2 ON public.orders (created_at) WHERE status IN ('new','on_hold','pending_bump','pending_details');