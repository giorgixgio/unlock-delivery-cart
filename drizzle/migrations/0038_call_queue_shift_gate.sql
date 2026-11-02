ALTER TABLE public.operator_shifts ADD COLUMN IF NOT EXISTS auto_ended boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.call_queue_settings.enabled_operators IS 'DEPRECATED: queue access now comes from operators_use_queue + shift check-in';

-- Backfill: keep only the newest open shift per operator so the unique index can be created.
UPDATE public.operator_shifts s SET ended_at = greatest(s.updated_at, s.started_at), auto_ended = true
WHERE s.ended_at IS NULL AND EXISTS (
  SELECT 1 FROM public.operator_shifts n WHERE n.ended_at IS NULL AND lower(n.operator) = lower(s.operator) AND n.started_at > s.started_at);
CREATE UNIQUE INDEX IF NOT EXISTS operator_shifts_one_open_idx ON public.operator_shifts (lower(operator)) WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION public.call_queue_on_shift(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.operator_shifts s WHERE lower(s.operator) = lower(coalesce(p_email,'')) AND s.ended_at IS NULL AND NOT s.paused)
$$;
REVOKE ALL ON FUNCTION public.call_queue_on_shift(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_on_shift(text) TO authenticated;

-- Pausing or ending a shift releases that operator's queue locks immediately.
CREATE OR REPLACE FUNCTION public.operator_shifts_release_locks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.ended_at IS NOT NULL AND OLD.ended_at IS NULL) OR (NEW.paused AND NOT OLD.paused) THEN
    UPDATE public.orders SET queue_locked_by = NULL, queue_locked_until = NULL
    WHERE lower(queue_locked_by) = lower(NEW.operator) AND queue_locked_until > now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS operator_shifts_release_locks_trg ON public.operator_shifts;
CREATE TRIGGER operator_shifts_release_locks_trg AFTER UPDATE ON public.operator_shifts
  FOR EACH ROW EXECUTE FUNCTION public.operator_shifts_release_locks();

-- Lazily close forgotten shifts: idle 60 min (not paused), past work_end + 1h, or from a previous Tbilisi day.
CREATE OR REPLACE FUNCTION public.call_queue_autoend_shifts()
RETURNS int LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.call_queue_settings := public.call_queue_cfg(); s record; v_last timestamptz; v_n int := 0;
  v_now_l timestamp := now() AT TIME ZONE 'Asia/Tbilisi';
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RETURN 0; END IF;
  FOR s IN SELECT * FROM public.operator_shifts WHERE ended_at IS NULL FOR UPDATE SKIP LOCKED LOOP
    SELECT greatest(s.started_at, s.updated_at,
      (SELECT max(e.created_at) FROM public.order_events e WHERE e.created_at >= s.started_at AND lower(e.actor) = lower(s.operator)),
      (SELECT max(greatest(x.session_started_at, coalesce(x.session_ended_at, x.session_started_at))) FROM public.operator_order_sessions x
        WHERE x.session_started_at >= s.started_at AND lower(x.operator) = lower(s.operator)))
    INTO v_last;
    IF (s.started_at AT TIME ZONE 'Asia/Tbilisi')::date < v_now_l::date
       OR v_now_l::time > (c.work_end::time + interval '1 hour')
       OR (NOT s.paused AND v_last < now() - interval '60 minutes') THEN
      UPDATE public.operator_shifts SET ended_at = least(v_last, now()), auto_ended = true, paused = false, updated_at = now() WHERE id = s.id;
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_autoend_shifts() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_autoend_shifts() TO authenticated;

-- Start shift: resume the open one if it exists, otherwise insert.
CREATE OR REPLACE FUNCTION public.call_queue_shift_start()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); v_id uuid;
BEGIN
  PERFORM public.call_queue_autoend_shifts();
  SELECT id INTO v_id FROM public.operator_shifts WHERE lower(operator) = lower(v_actor) AND ended_at IS NULL FOR UPDATE;
  IF v_id IS NOT NULL THEN
    UPDATE public.operator_shifts SET paused = false, updated_at = now() WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id, 'resumed', true);
  END IF;
  INSERT INTO public.operator_shifts(operator) VALUES (v_actor) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'resumed', false);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_shift_start() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_shift_start() TO authenticated;

-- Access: master switch + operator/manager, or admin. Per-operator list no longer read.
CREATE OR REPLACE FUNCTION public.call_queue_actor()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_cfg public.call_queue_settings;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_cfg := public.call_queue_cfg();
  IF EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'admin') THEN RETURN v_email; END IF;
  IF v_cfg.operators_use_queue AND (
       EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'operator' AND au.is_active)
       OR lower(v_email) = ANY (SELECT lower(x) FROM unnest(v_cfg.manager_emails) x)) THEN RETURN v_email; END IF;
  RAISE EXCEPTION 'call queue not enabled for this user';
END $$;
REVOKE ALL ON FUNCTION public.call_queue_actor() FROM public, anon;

-- Sticky callbacks fall through immediately when the original operator is not on shift.
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
      CASE WHEN o.queue_last_touched_by IS NULL OR o.next_call_after IS NULL
             OR o.next_call_after <= now() - interval '30 minutes'
             OR NOT public.call_queue_on_shift(o.queue_last_touched_by) THEN 3 ELSE NULL END
    WHEN o.next_call_after IS NULL AND o.last_call_attempt_at IS NOT NULL AND o.last_call_attempt_at > now() - make_interval(mins => p_gap_minutes) THEN NULL
    ELSE 4
  END
$$;

CREATE OR REPLACE FUNCTION public.call_queue_next(p_store text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg(); v_id uuid; v_until timestamptz;
  v_open boolean; v_paused boolean;
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

  SELECT o.id INTO v_id FROM public.orders o
  WHERE o.status IN ('new','on_hold','pending_bump')
    AND public.call_queue_tier(o, v_actor, v_cfg.retry_gap_minutes) IS NOT NULL
    AND public.call_queue_store_match(o.id, p_store)
  ORDER BY public.call_queue_tier(o, v_actor, v_cfg.retry_gap_minutes),
    CASE WHEN public.call_queue_tier(o, v_actor, v_cfg.retry_gap_minutes) = 2 THEN o.created_at END ASC,
    o.next_call_after ASC NULLS FIRST, o.created_at ASC
  LIMIT 1
  FOR UPDATE OF o SKIP LOCKED;
  IF v_id IS NULL THEN RETURN jsonb_build_object('order_id', NULL); END IF;

  v_until := now() + make_interval(mins => v_cfg.lock_minutes);
  UPDATE public.orders SET queue_locked_by = v_actor, queue_locked_until = v_until WHERE id = v_id;
  RETURN jsonb_build_object('order_id', v_id, 'resumed', false, 'locked_until', v_until);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_next(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_next(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_assign(p_order_id uuid, p_operator text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me text;
BEGIN
  IF NOT public.call_queue_is_manager() THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public.call_queue_autoend_shifts();
  IF NOT public.call_queue_on_shift(p_operator) THEN RAISE EXCEPTION 'operator is not on shift'; END IF;
  SELECT email INTO v_me FROM auth.users WHERE id = auth.uid();
  UPDATE public.orders SET queue_locked_by = p_operator, queue_locked_until = now() + interval '30 minutes' WHERE id = p_order_id;
  INSERT INTO public.order_events(order_id, actor, event_type, payload)
  VALUES (p_order_id, v_me, 'queue_assign', jsonb_build_object('operator', p_operator));
END $$;
REVOKE ALL ON FUNCTION public.call_queue_assign(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_assign(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_stats(p_store text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date; r jsonb;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  PERFORM public.call_queue_autoend_shifts();
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