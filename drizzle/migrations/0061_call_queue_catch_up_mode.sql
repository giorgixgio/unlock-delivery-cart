ALTER TABLE public.call_queue_settings ADD COLUMN catch_up_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_queue_settings ADD COLUMN catch_up_gap_minutes integer NOT NULL DEFAULT 15 CHECK(catch_up_gap_minutes BETWEEN 1 AND 120);
CREATE OR REPLACE FUNCTION public.call_queue_tier(o orders, p_caller text, p_gap_minutes integer)
RETURNS integer LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
 SELECT CASE
 WHEN (public.call_queue_cfg()).catch_up_enabled AND COALESCE(o.call_outcome,'') <> 'callback' THEN
 CASE WHEN NOT public.call_queue_is_open(o) OR public.is_test_order(o.id)
 OR o.onway_sent_at IS NOT NULL OR o.merged_into_order_id IS NOT NULL
 OR COALESCE(o.onway_api_status,'') IN ('sent','sending') OR NULLIF(o.tracking_number,'') IS NOT NULL OR NULLIF(o.onway_tracking,'') IS NOT NULL OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL
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
 WHERE lower(o.queue_locked_by)=lower(v_actor) AND o.queue_locked_until>now() AND public.call_queue_is_open(o)
 ORDER BY o.queue_locked_until DESC LIMIT 1;
 IF v_id IS NOT NULL THEN RETURN jsonb_build_object('order_id',v_id,'resumed',true,'locked_until',v_until); END IF;
 SELECT picks INTO v_picks FROM public.call_queue_pick_counts WHERE operator=lower(v_actor) AND day=v_today;
 v_turn := (COALESCE(v_picks,0)+1)%GREATEST(COALESCE(v_cfg.retry_every_n,4),1)=0;
 v_old_turn := COALESCE(v_picks,0)%GREATEST(COALESCE(v_cfg.backlog_mix,2),2)=0;
 IF v_cfg.catch_up_enabled THEN
 SELECT o.id INTO v_id FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 ORDER BY CASE WHEN o.call_outcome='callback' THEN 0 ELSE 1 END,
 CASE WHEN o.call_outcome='callback' THEN COALESCE(o.next_call_after,o.created_at) END ASC,
 CASE WHEN COALESCE(o.call_outcome,'')<>'callback' THEN COALESCE(o.call_attempt_count,0) END ASC,
 CASE WHEN COALESCE(o.call_outcome,'')<>'callback' THEN o.last_call_attempt_at END ASC NULLS FIRST,
 o.created_at DESC,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 ELSE
 SELECT EXISTS (
 SELECT 1 FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 AND ((tt.t=2 AND o.created_at<now()-interval '3 hours') OR (tt.t=4 AND COALESCE(o.next_call_after,o.last_call_attempt_at+make_interval(mins=>v_cfg.retry_gap_minutes),o.created_at)<now()-interval '3 hours'))
 ) INTO v_has_backlog;
 SELECT o.id INTO v_id FROM public.orders o,LATERAL (SELECT public.call_queue_tier(o,v_actor,v_cfg.retry_gap_minutes) AS t) tt
 WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND tt.t IS NOT NULL AND public.call_queue_store_match(o.id,p_store)
 ORDER BY public.call_queue_rank(tt.t,o.created_at,COALESCE(o.next_call_after,o.last_call_attempt_at+make_interval(mins=>v_cfg.retry_gap_minutes),o.created_at),o.last_call_attempt_at,now(),v_cfg.work_start,v_cfg.work_end,COALESCE(v_cfg.morning_block_until,'12:00'),v_turn,v_has_backlog,v_old_turn),o.created_at ASC
 LIMIT 1 FOR UPDATE OF o SKIP LOCKED;
 END IF;
 IF v_id IS NULL THEN RETURN jsonb_build_object('order_id',NULL); END IF;
 v_until := now()+make_interval(mins=>v_cfg.lock_minutes);
 UPDATE public.orders SET queue_locked_by=v_actor,queue_locked_until=v_until WHERE id=v_id;
 INSERT INTO public.call_queue_pick_counts(operator,day,picks) VALUES(lower(v_actor),v_today,1) ON CONFLICT(operator,day) DO UPDATE SET picks=public.call_queue_pick_counts.picks+1;
 RETURN jsonb_build_object('order_id',v_id,'resumed',false,'locked_until',v_until);
END $function$;
CREATE OR REPLACE FUNCTION public.call_queue_schedule_retry(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg(); o public.orders; v_first timestamptz; v_max int; v_at timestamptz; v_slot timestamptz;
BEGIN
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
 IF v_cfg.catch_up_enabled THEN
 -- Preserve normal due time under temporary eligibility; beyond-limit leads get next-day timing, no switch-off sweep.
 v_max := v_cfg.max_attempts+COALESCE(o.queue_extra_attempts,0);
 v_at := public.call_queue_compute_retry(COALESCE(o.call_attempt_count,0),o.last_call_attempt_at,now(),v_cfg.retry_gap_minutes,GREATEST(v_max,COALESCE(o.call_attempt_count,0)+1),v_cfg.work_start,v_cfg.work_end);
 IF COALESCE(o.call_attempt_count,0)<=1 AND public.call_queue_is_night(o.created_at,v_cfg.night_from,v_cfg.night_to) THEN
 v_slot := ((now() AT TIME ZONE 'Asia/Tbilisi')::date+v_cfg.night_retry_slot::time) AT TIME ZONE 'Asia/Tbilisi';
 IF v_slot>now() THEN v_at:=v_slot; END IF; END IF;
 UPDATE public.orders SET next_call_after=v_at,queue_locked_by=NULL,queue_locked_until=NULL,queue_last_touched_by=v_actor WHERE id=p_order_id;
 RETURN jsonb_build_object('action','retry','next_call_after',now()+make_interval(mins=>v_cfg.catch_up_gap_minutes),'attempt_count',COALESCE(o.call_attempt_count,0),'max_attempts',v_max,'catch_up',true);
 END IF;
 SELECT min((e->>'at')::timestamptz) INTO v_first FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.call_attempt_history)='array' THEN o.call_attempt_history ELSE '[]'::jsonb END) e WHERE e->>'outcome'='no_answer';
 v_max := v_cfg.max_attempts+COALESCE(o.queue_extra_attempts,0);
 v_at := public.call_queue_compute_retry(COALESCE(o.call_attempt_count,0),COALESCE(v_first,o.last_call_attempt_at,now()),now(),v_cfg.retry_gap_minutes,v_max,v_cfg.work_start,v_cfg.work_end);
 IF v_at IS NOT NULL AND COALESCE(o.call_attempt_count,0)<=1 AND public.call_queue_is_night(o.created_at,v_cfg.night_from,v_cfg.night_to) THEN
 v_slot := ((now() AT TIME ZONE 'Asia/Tbilisi')::date+v_cfg.night_retry_slot::time) AT TIME ZONE 'Asia/Tbilisi'; IF v_slot>now() THEN v_at:=v_slot; END IF; END IF;
 IF v_at IS NULL THEN UPDATE public.orders SET queue_last_touched_by=v_actor WHERE id=p_order_id;
 RETURN jsonb_build_object('action','cancel','attempt_count',COALESCE(o.call_attempt_count,0),'max_attempts',v_max); END IF;
 UPDATE public.orders SET next_call_after=v_at,queue_locked_by=NULL,queue_locked_until=NULL,queue_last_touched_by=v_actor WHERE id=p_order_id;
 RETURN jsonb_build_object('action','retry','next_call_after',v_at,'attempt_count',COALESCE(o.call_attempt_count,0),'max_attempts',v_max);
END $function$;
CREATE OR REPLACE FUNCTION public.call_queue_stats(p_store text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; r jsonb; v_gap int := (public.call_queue_cfg()).retry_gap_minutes;
BEGIN
 IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
 PERFORM public.call_queue_autoend_shifts();
 IF (public.call_queue_cfg()).catch_up_enabled THEN
 WITH leads AS (SELECT o.*,public.call_queue_tier(o,COALESCE(o.queue_last_touched_by,''),v_gap) AS t FROM public.orders o WHERE public.call_queue_is_open(o) AND public.call_queue_store_match(o.id,p_store))
 SELECT jsonb_build_object('fresh_waiting',count(*) FILTER(WHERE t=2),'callbacks_due',count(*) FILTER(WHERE t IN(1,3)),'retries_due',count(*) FILTER(WHERE t=4),'night_waiting',0,
 'retries_later_today',count(*) FILTER(WHERE t IS NULL AND COALESCE(call_outcome,'')<>'callback' AND last_call_attempt_at>now()-make_interval(mins=>(public.call_queue_cfg()).catch_up_gap_minutes)),
 'retries_tomorrow',0,'locked_now',count(*) FILTER(WHERE queue_locked_until>now()),'oldest_fresh_seconds',extract(epoch FROM now()-min(created_at) FILTER(WHERE t=2))::int,'retries_overdue',0,'oldest_retry_overdue_seconds',NULL) INTO r FROM leads;
 RETURN r; END IF;
 WITH open AS (SELECT o.*,public.call_queue_night_held(o,now()) AS night_held,COALESCE(o.next_call_after,o.last_call_attempt_at+make_interval(mins=>v_gap)) AS retry_due_at FROM public.orders o WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND public.call_queue_is_open(o) AND public.call_queue_store_match(o.id,p_store))
 SELECT jsonb_build_object(
 'fresh_waiting',count(*) FILTER(WHERE NOT night_held AND COALESCE(call_attempt_count,0)=0 AND COALESCE(call_outcome,'')<>'callback' AND (next_call_after IS NULL OR next_call_after<=now())),
 'night_waiting',count(*) FILTER(WHERE night_held),
 'callbacks_due',count(*) FILTER(WHERE call_outcome='callback' AND (next_call_after IS NULL OR next_call_after<=now())),
 'retries_due',count(*) FILTER(WHERE COALESCE(call_attempt_count,0)>0 AND COALESCE(call_outcome,'')<>'callback' AND (next_call_after IS NULL OR next_call_after<=now())),
 'retries_later_today',count(*) FILTER(WHERE COALESCE(call_outcome,'')<>'callback' AND next_call_after>now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date=v_today),
 'retries_tomorrow',count(*) FILTER(WHERE COALESCE(call_outcome,'')<>'callback' AND next_call_after>now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date=v_today+1),
 'locked_now',count(*) FILTER(WHERE queue_locked_until>now()),
 'oldest_fresh_seconds',extract(epoch FROM now()-min(created_at) FILTER(WHERE NOT night_held AND COALESCE(call_attempt_count,0)=0 AND COALESCE(call_outcome,'')<>'callback' AND (next_call_after IS NULL OR next_call_after<=now())))::int,
 'retries_overdue',count(*) FILTER(WHERE COALESCE(call_attempt_count,0)>0 AND COALESCE(call_outcome,'')<>'callback' AND retry_due_at<now()),
 'oldest_retry_overdue_seconds',extract(epoch FROM now()-min(retry_due_at) FILTER(WHERE COALESCE(call_attempt_count,0)>0 AND COALESCE(call_outcome,'')<>'callback' AND retry_due_at<now()))::int) INTO r FROM open;
 RETURN r;
END $function$;
CREATE OR REPLACE FUNCTION public.call_queue_catchup_cancel_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF (public.call_queue_cfg()).catch_up_enabled AND NEW.status IN ('canceled','cancelled') AND OLD.status NOT IN ('canceled','cancelled') AND NEW.final_cancel_reason='no_answer_after_attempts' THEN
 RAISE EXCEPTION 'Catch-up mode: no-answer attempt-limit cancellation is paused'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER call_queue_catchup_cancel_guard BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.call_queue_catchup_cancel_guard();