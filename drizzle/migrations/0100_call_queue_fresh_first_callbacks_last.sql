CREATE OR REPLACE FUNCTION public.call_queue_rank(p_tier integer, p_created timestamptz, p_due timestamptz, p_last timestamptz, p_now timestamptz, p_ws text, p_we text, p_morning_until text, p_retry_turn boolean, p_has_backlog boolean, p_old_turn boolean, p_attempts integer)
RETURNS double precision[] LANGUAGE sql IMMUTABLE AS $function$
-- Ordering only: legacy mixing/turn inputs cannot put retries ahead of fresh.
SELECT CASE
 WHEN p_tier = 2 THEN ARRAY[0::double precision, -extract(epoch FROM p_created)::double precision]
 WHEN p_tier = 1 THEN ARRAY[2::double precision, extract(epoch FROM p_due)::double precision, -extract(epoch FROM p_created)::double precision]
 WHEN p_tier = 3 THEN ARRAY[3::double precision, extract(epoch FROM p_due)::double precision, -extract(epoch FROM p_created)::double precision]
 ELSE ARRAY[1::double precision, COALESCE(p_attempts,0)::double precision, COALESCE(extract(epoch FROM p_last)::double precision,'-Infinity'::double precision), -extract(epoch FROM p_created)::double precision]
END;
$function$;

CREATE OR REPLACE FUNCTION public.call_queue_rank(p_tier integer, p_created timestamptz, p_due timestamptz, p_last timestamptz, p_now timestamptz, p_ws text, p_we text, p_morning_until text, p_retry_turn boolean, p_has_backlog boolean, p_old_turn boolean)
RETURNS double precision[] LANGUAGE sql IMMUTABLE AS $function$
-- Compatibility for existing callers that do not supply attempts.
SELECT public.call_queue_rank(p_tier,p_created,p_due,p_last,p_now,p_ws,p_we,p_morning_until,p_retry_turn,p_has_backlog,p_old_turn,CASE WHEN p_tier=4 THEN 1 ELSE 0 END);
$function$;

CREATE OR REPLACE FUNCTION public.call_queue_next(p_store text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg(); v_id uuid; v_until timestamptz;
 v_open boolean; v_paused boolean; v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; v_picks int; v_turn boolean; v_has_backlog boolean; v_old_turn boolean;
BEGIN
 PERFORM public.call_queue_autoend_shifts();
 SELECT true,s.paused INTO v_open,v_paused FROM public.operator_shifts s WHERE lower(s.operator)=lower(v_actor) AND s.ended_at IS NULL LIMIT 1;
 IF v_open IS NULL THEN RETURN jsonb_build_object('order_id',NULL,'error','not_on_shift'); END IF;
 IF v_paused THEN RETURN jsonb_build_object('order_id',NULL,'error','paused'); END IF;
 SELECT o.id,o.queue_locked_until INTO v_id,v_until FROM public.orders o
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND lower(o.queue_locked_by)=lower(v_actor) AND o.queue_locked_until>now() AND public.call_queue_is_open(o)
 ORDER BY o.queue_locked_until DESC LIMIT 1;
 IF v_id IS NOT NULL THEN RETURN jsonb_build_object('order_id',v_id,'resumed',true,'locked_until',v_until); END IF;
 SELECT picks INTO v_picks FROM public.call_queue_pick_counts WHERE operator=lower(v_actor) AND day=v_today;
 v_turn := (COALESCE(v_picks,0)+1)%GREATEST(COALESCE(v_cfg.retry_every_n,4),1)=0;
 v_old_turn := COALESCE(v_picks,0)%GREATEST(COALESCE(v_cfg.backlog_mix,2),2)=0;
 IF v_cfg.catch_up_enabled THEN
 SELECT o.id INTO v_id FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 ORDER BY CASE WHEN tt.t=2 THEN 0 WHEN tt.t=4 THEN 1 WHEN tt.t=1 THEN 2 ELSE 3 END,
 CASE WHEN o.call_outcome='callback' THEN COALESCE(o.next_call_after,o.created_at) END ASC,
 CASE WHEN tt.t=4 THEN COALESCE(o.call_attempt_count,0) END ASC,
 CASE WHEN tt.t=4 THEN o.last_call_attempt_at END ASC NULLS FIRST,
 o.created_at DESC,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 ELSE
 SELECT EXISTS (
 SELECT 1 FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 AND ((tt.t=2 AND o.created_at<now()-interval '3 hours') OR (tt.t=4 AND COALESCE(o.next_call_after,o.last_call_attempt_at+make_interval(mins=>v_cfg.retry_gap_minutes),o.created_at)<now()-interval '3 hours'))
 ) INTO v_has_backlog;
 SELECT o.id INTO v_id FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 ORDER BY public.call_queue_rank(tt.t,o.created_at,CASE WHEN o.call_outcome='callback' THEN COALESCE(o.next_call_after,o.created_at) ELSE COALESCE(o.next_call_after,o.last_call_attempt_at+make_interval(mins=>v_cfg.retry_gap_minutes),o.created_at) END,o.last_call_attempt_at,now(),v_cfg.work_start,v_cfg.work_end,COALESCE(v_cfg.morning_block_until,'12:00'),v_turn,v_has_backlog,v_old_turn,COALESCE(o.call_attempt_count,0)),o.id
 LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 END IF;
 IF v_id IS NULL THEN RETURN jsonb_build_object('order_id',NULL); END IF;
 v_until := now()+make_interval(mins=>v_cfg.lock_minutes);
 UPDATE public.orders SET queue_locked_by=v_actor,queue_locked_until=v_until WHERE id=v_id;
 INSERT INTO public.call_queue_pick_counts(operator,day,picks) VALUES(lower(v_actor),v_today,1) ON CONFLICT(operator,day) DO UPDATE SET picks=public.call_queue_pick_counts.picks+1;
 RETURN jsonb_build_object('order_id',v_id,'resumed',false,'locked_until',v_until);
END $function$;