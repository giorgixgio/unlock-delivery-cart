ALTER TABLE public.call_queue_settings ADD COLUMN IF NOT EXISTS operators_use_queue boolean NOT NULL DEFAULT false;
ALTER TABLE public.call_queue_settings ADD COLUMN IF NOT EXISTS night_from text NOT NULL DEFAULT '00:00';
ALTER TABLE public.call_queue_settings ADD COLUMN IF NOT EXISTS night_to text NOT NULL DEFAULT '07:00';
ALTER TABLE public.call_queue_settings ADD COLUMN IF NOT EXISTS night_first_call_after text NOT NULL DEFAULT '12:00';
ALTER TABLE public.call_queue_settings ADD COLUMN IF NOT EXISTS night_retry_slot text NOT NULL DEFAULT '18:00';

-- Settings policies: read caller email from the JWT (authenticated cannot read auth.users).
DROP POLICY IF EXISTS "cq settings admin insert" ON public.call_queue_settings;
CREATE POLICY "cq settings admin insert" ON public.call_queue_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(coalesce(auth.jwt()->>'email','')) AND au.role = 'admin' AND au.is_active));
DROP POLICY IF EXISTS "cq settings admin update" ON public.call_queue_settings;
CREATE POLICY "cq settings admin update" ON public.call_queue_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(coalesce(auth.jwt()->>'email','')) AND au.role = 'admin' AND au.is_active))
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.call_queue_cfg()
RETURNS public.call_queue_settings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.call_queue_settings;
BEGIN
  SELECT * INTO r FROM public.call_queue_settings WHERE id = true;
  IF NOT FOUND THEN
    r.id := true; r.enabled_operators := '{}'; r.manager_emails := '{eto@bigmart.ge}';
    r.retry_gap_minutes := 120; r.max_attempts := 3; r.work_start := '10:00'; r.work_end := '21:00'; r.lock_minutes := 10;
    r.operators_use_queue := false; r.night_from := '00:00'; r.night_to := '07:00';
    r.night_first_call_after := '12:00'; r.night_retry_slot := '18:00';
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_cfg() FROM public, anon;

-- Master switch: every active operator may use the queue when operators_use_queue is on.
CREATE OR REPLACE FUNCTION public.call_queue_actor()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_cfg public.call_queue_settings;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_cfg := public.call_queue_cfg();
  IF EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'admin') THEN RETURN v_email; END IF;
  IF v_cfg.operators_use_queue AND EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'operator' AND au.is_active) THEN RETURN v_email; END IF;
  IF lower(v_email) = ANY (SELECT lower(x) FROM unnest(v_cfg.enabled_operators) x) THEN RETURN v_email; END IF;
  RAISE EXCEPTION 'call queue not enabled for this user';
END $$;
REVOKE ALL ON FUNCTION public.call_queue_actor() FROM public, anon;

-- Night lead: created within [night_from, night_to) Tbilisi time (supports wrap past midnight).
CREATE OR REPLACE FUNCTION public.call_queue_is_night(p_created timestamptz, p_from text, p_to text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p_from::time <= p_to::time
    THEN (p_created AT TIME ZONE 'Asia/Tbilisi')::time >= p_from::time AND (p_created AT TIME ZONE 'Asia/Tbilisi')::time < p_to::time
    ELSE (p_created AT TIME ZONE 'Asia/Tbilisi')::time >= p_from::time OR (p_created AT TIME ZONE 'Asia/Tbilisi')::time < p_to::time END
$$;

/** Fresh night lead still waiting for night_first_call_after on its local day. */
CREATE OR REPLACE FUNCTION public.call_queue_night_held(o public.orders, p_now timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.call_queue_settings := public.call_queue_cfg(); v_created_l timestamp; v_release_day date;
BEGIN
  IF COALESCE(o.call_attempt_count,0) > 0 OR COALESCE(o.call_outcome,'') = 'callback' THEN RETURN false; END IF;
  IF NOT public.call_queue_is_night(o.created_at, c.night_from, c.night_to) THEN RETURN false; END IF;
  v_created_l := o.created_at AT TIME ZONE 'Asia/Tbilisi';
  -- With a wrapping window, leads before midnight release on the next day.
  v_release_day := CASE WHEN v_created_l::time >= c.night_from::time AND c.night_from::time > c.night_to::time THEN v_created_l::date + 1 ELSE v_created_l::date END;
  RETURN (p_now AT TIME ZONE 'Asia/Tbilisi') < (v_release_day + c.night_first_call_after::time);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_night_held(public.orders, timestamptz) FROM public, anon;

CREATE OR REPLACE FUNCTION public.call_queue_tier(o public.orders, p_caller text, p_gap_minutes int)
RETURNS int LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN NOT public.call_queue_is_open(o) THEN NULL
    WHEN o.next_call_after IS NOT NULL AND o.next_call_after > now() THEN NULL
    WHEN o.queue_locked_until IS NOT NULL AND o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
    WHEN public.call_queue_night_held(o, now()) THEN NULL
    WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
    WHEN COALESCE(o.call_attempt_count, 0) = 0 AND COALESCE(o.call_outcome, '') <> 'callback' THEN 2
    WHEN o.call_outcome = 'callback' THEN
      CASE WHEN o.queue_last_touched_by IS NULL OR o.next_call_after IS NULL OR o.next_call_after <= now() - interval '30 minutes' THEN 3 ELSE NULL END
    WHEN o.next_call_after IS NULL AND o.last_call_attempt_at IS NOT NULL AND o.last_call_attempt_at > now() - make_interval(mins => p_gap_minutes) THEN NULL
    ELSE 4
  END
$$;

CREATE OR REPLACE FUNCTION public.call_queue_schedule_retry(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg();
  o public.orders; v_first timestamptz; v_max int; v_at timestamptz; v_slot timestamptz;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT min((e->>'at')::timestamptz) INTO v_first
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.call_attempt_history) = 'array' THEN o.call_attempt_history ELSE '[]'::jsonb END) e
  WHERE e->>'outcome' = 'no_answer';
  v_max := v_cfg.max_attempts + COALESCE(o.queue_extra_attempts, 0);
  v_at := public.call_queue_compute_retry(COALESCE(o.call_attempt_count, 0), COALESCE(v_first, o.last_call_attempt_at, now()), now(),
    v_cfg.retry_gap_minutes, v_max, v_cfg.work_start, v_cfg.work_end);
  -- Night lead, first no-answer: retry at night_retry_slot today if still ahead.
  IF v_at IS NOT NULL AND COALESCE(o.call_attempt_count, 0) <= 1
     AND public.call_queue_is_night(o.created_at, v_cfg.night_from, v_cfg.night_to) THEN
    v_slot := ((now() AT TIME ZONE 'Asia/Tbilisi')::date + v_cfg.night_retry_slot::time) AT TIME ZONE 'Asia/Tbilisi';
    IF v_slot > now() THEN v_at := v_slot; END IF;
  END IF;
  IF v_at IS NULL THEN
    UPDATE public.orders SET queue_last_touched_by = v_actor WHERE id = p_order_id;
    RETURN jsonb_build_object('action', 'cancel', 'attempt_count', COALESCE(o.call_attempt_count, 0), 'max_attempts', v_max);
  END IF;
  UPDATE public.orders SET next_call_after = v_at, queue_locked_by = NULL, queue_locked_until = NULL, queue_last_touched_by = v_actor
  WHERE id = p_order_id;
  RETURN jsonb_build_object('action', 'retry', 'next_call_after', v_at, 'attempt_count', COALESCE(o.call_attempt_count, 0), 'max_attempts', v_max);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_schedule_retry(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_schedule_retry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_stats(p_store text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; r jsonb;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  WITH open AS (
    SELECT o.*, public.call_queue_night_held(o, now()) AS night_held FROM public.orders o
    WHERE o.status IN ('new','on_hold','pending_bump') AND public.call_queue_is_open(o) AND public.call_queue_store_match(o.id, p_store)
  )
  SELECT jsonb_build_object(
    'fresh_waiting', count(*) FILTER (WHERE NOT night_held AND COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'night_waiting', count(*) FILTER (WHERE night_held),
    'callbacks_due', count(*) FILTER (WHERE call_outcome = 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_due', count(*) FILTER (WHERE COALESCE(call_attempt_count,0) > 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_later_today', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today),
    'retries_tomorrow', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today + 1),
    'locked_now', count(*) FILTER (WHERE queue_locked_until > now()),
    'oldest_fresh_seconds', extract(epoch FROM now() - min(created_at) FILTER (WHERE NOT night_held AND COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())))::int
  ) INTO r FROM open;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_stats(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_stats(text) TO authenticated;