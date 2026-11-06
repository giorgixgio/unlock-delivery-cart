ALTER TABLE public.call_queue_settings
  ADD COLUMN IF NOT EXISTS morning_block_until text NOT NULL DEFAULT '12:00',
  ADD COLUMN IF NOT EXISTS retry_every_n integer NOT NULL DEFAULT 4;

-- Per-operator count of call_queue_next hand-outs per Tbilisi day (drives the every-Nth retry slot).
CREATE TABLE IF NOT EXISTS public.call_queue_pick_counts (
  operator text NOT NULL,
  day date NOT NULL,
  picks integer NOT NULL DEFAULT 0,
  PRIMARY KEY (operator, day)
);
GRANT ALL ON public.call_queue_pick_counts TO service_role;
ALTER TABLE public.call_queue_pick_counts ENABLE ROW LEVEL SECURITY;

-- Pure sort key; mirrored by queueRank in src/lib/callQueuePolicy.ts.
-- Groups: 0 my callback, 1 other callback, 2 morning carried-over retry, 3 morning off-hours fresh (newest),
-- 4 starved (>3h, oldest), 5 retry on its every-Nth turn, 6 fresh newest, 7 retry oldest due.
CREATE OR REPLACE FUNCTION public.call_queue_rank(p_tier integer, p_created timestamptz, p_due timestamptz, p_last timestamptz,
  p_now timestamptz, p_ws text, p_we text, p_morning_until text, p_retry_turn boolean)
RETURNS double precision[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_now_l timestamp := p_now AT TIME ZONE 'Asia/Tbilisi';
  v_c time := (p_created AT TIME ZONE 'Asia/Tbilisi')::time;
  v_morning boolean := v_now_l::time >= p_ws::time AND v_now_l::time < p_morning_until::time;
  v_due double precision := extract(epoch FROM p_due);
  v_cr double precision := extract(epoch FROM p_created);
BEGIN
  IF p_tier = 1 THEN RETURN ARRAY[0, v_due]; END IF;
  IF p_tier = 3 THEN RETURN ARRAY[1, v_due]; END IF;
  IF v_morning THEN
    IF p_tier = 4 AND p_last IS NOT NULL AND (p_last AT TIME ZONE 'Asia/Tbilisi')::date < v_now_l::date THEN RETURN ARRAY[2, v_due]; END IF;
    IF p_tier = 2 AND (v_c < p_ws::time OR v_c >= p_we::time) THEN RETURN ARRAY[3, -v_cr]; END IF;
  END IF;
  IF p_tier = 2 AND p_created < p_now - interval '3 hours' THEN RETURN ARRAY[4, v_cr]; END IF;
  IF p_tier = 4 AND p_due < p_now - interval '3 hours' THEN RETURN ARRAY[4, v_due]; END IF;
  IF p_tier = 4 AND p_retry_turn THEN RETURN ARRAY[5, v_due]; END IF;
  IF p_tier = 2 THEN RETURN ARRAY[6, -v_cr]; END IF;
  RETURN ARRAY[7, v_due];
END $$;

CREATE OR REPLACE FUNCTION public.call_queue_next(p_store text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg(); v_id uuid; v_until timestamptz;
  v_open boolean; v_paused boolean; v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; v_picks int; v_turn boolean;
BEGIN
  PERFORM public.call_queue_autoend_shifts();
  SELECT true, s.paused INTO v_open, v_paused FROM public.operator_shifts s WHERE lower(s.operator) = lower(v_actor) AND s.ended_at IS NULL LIMIT 1;
  IF v_open IS NULL THEN RETURN jsonb_build_object('order_id', NULL, 'error', 'not_on_shift'); END IF;
  IF v_paused THEN RETURN jsonb_build_object('order_id', NULL, 'error', 'paused'); END IF;

  SELECT o.id, o.queue_locked_until INTO v_id, v_until FROM public.orders o
  WHERE lower(o.queue_locked_by) = lower(v_actor) AND o.queue_locked_until > now() AND public.call_queue_is_open(o)
  ORDER BY o.queue_locked_until DESC LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('order_id', v_id, 'resumed', true, 'locked_until', v_until);
  END IF;

  SELECT picks INTO v_picks FROM public.call_queue_pick_counts WHERE operator = lower(v_actor) AND day = v_today;
  v_turn := GREATEST(COALESCE(v_cfg.retry_every_n, 4), 1) > 0
    AND (COALESCE(v_picks, 0) + 1) % GREATEST(COALESCE(v_cfg.retry_every_n, 4), 1) = 0;

  SELECT o.id INTO v_id FROM public.orders o,
    LATERAL (SELECT public.call_queue_tier(o, v_actor, v_cfg.retry_gap_minutes) AS t) tt
  WHERE o.status IN ('new','on_hold','pending_bump','pending_details')
    AND tt.t IS NOT NULL
    AND public.call_queue_store_match(o.id, p_store)
  ORDER BY public.call_queue_rank(tt.t, o.created_at,
      COALESCE(o.next_call_after, o.last_call_attempt_at + make_interval(mins => v_cfg.retry_gap_minutes), o.created_at),
      o.last_call_attempt_at, now(), v_cfg.work_start, v_cfg.work_end, COALESCE(v_cfg.morning_block_until, '12:00'), v_turn),
    o.created_at ASC
  LIMIT 1
  FOR UPDATE OF o SKIP LOCKED;
  IF v_id IS NULL THEN RETURN jsonb_build_object('order_id', NULL); END IF;

  v_until := now() + make_interval(mins => v_cfg.lock_minutes);
  UPDATE public.orders SET queue_locked_by = v_actor, queue_locked_until = v_until WHERE id = v_id;
  INSERT INTO public.call_queue_pick_counts(operator, day, picks) VALUES (lower(v_actor), v_today, 1)
  ON CONFLICT (operator, day) DO UPDATE SET picks = public.call_queue_pick_counts.picks + 1;
  RETURN jsonb_build_object('order_id', v_id, 'resumed', false, 'locked_until', v_until);
END $function$;

-- Next-day attempts go to work_start; same-day 2nd attempt stays now + gap.
CREATE OR REPLACE FUNCTION public.call_queue_compute_retry(p_attempts integer, p_first_at timestamp with time zone, p_now timestamp with time zone, p_gap integer, p_max integer, p_work_start text, p_work_end text)
 RETURNS timestamp with time zone LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  v_now_l timestamp := p_now AT TIME ZONE 'Asia/Tbilisi';
  v_cand_l timestamp;
  v_ws time := p_work_start::time; v_we time := p_work_end::time;
BEGIN
  IF p_attempts >= p_max THEN RETURN NULL; END IF;
  IF p_attempts <= 1 THEN
    v_cand_l := v_now_l + make_interval(mins => p_gap);
    IF v_cand_l::date > v_now_l::date OR v_cand_l::time > v_we THEN
      v_cand_l := (v_now_l::date + 1) + v_ws;
    ELSIF v_cand_l::time < v_ws THEN
      v_cand_l := v_cand_l::date + v_ws;
    END IF;
  ELSE
    v_cand_l := (v_now_l::date + 1) + v_ws;
  END IF;
  RETURN v_cand_l AT TIME ZONE 'Asia/Tbilisi';
END $function$;

CREATE OR REPLACE FUNCTION public.call_queue_stats(p_store text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; r jsonb; v_gap int := (public.call_queue_cfg()).retry_gap_minutes;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public.call_queue_autoend_shifts();
  WITH open AS (
    SELECT o.*, public.call_queue_night_held(o, now()) AS night_held,
      COALESCE(o.next_call_after, o.last_call_attempt_at + make_interval(mins => v_gap)) AS retry_due_at
    FROM public.orders o
    WHERE o.status IN ('new','on_hold','pending_bump','pending_details') AND public.call_queue_is_open(o) AND public.call_queue_store_match(o.id, p_store)
  )
  SELECT jsonb_build_object(
    'fresh_waiting', count(*) FILTER (WHERE NOT night_held AND COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'night_waiting', count(*) FILTER (WHERE night_held),
    'callbacks_due', count(*) FILTER (WHERE call_outcome = 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_due', count(*) FILTER (WHERE COALESCE(call_attempt_count,0) > 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_later_today', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today),
    'retries_tomorrow', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today + 1),
    'locked_now', count(*) FILTER (WHERE queue_locked_until > now()),
    'oldest_fresh_seconds', extract(epoch FROM now() - min(created_at) FILTER (WHERE NOT night_held AND COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())))::int,
    'retries_overdue', count(*) FILTER (WHERE COALESCE(call_attempt_count,0) > 0 AND COALESCE(call_outcome,'') <> 'callback' AND retry_due_at < now()),
    'oldest_retry_overdue_seconds', extract(epoch FROM now() - min(retry_due_at) FILTER (WHERE COALESCE(call_attempt_count,0) > 0 AND COALESCE(call_outcome,'') <> 'callback' AND retry_due_at < now()))::int
  ) INTO r FROM open;
  RETURN r;
END $function$;