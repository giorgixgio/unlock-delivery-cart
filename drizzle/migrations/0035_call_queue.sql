-- Call Queue (additive, off by default)
CREATE TABLE IF NOT EXISTS public.call_queue_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled_operators text[] NOT NULL DEFAULT '{}',
  manager_emails text[] NOT NULL DEFAULT '{eto@bigmart.ge}',
  retry_gap_minutes int NOT NULL DEFAULT 120,
  max_attempts int NOT NULL DEFAULT 3,
  work_start text NOT NULL DEFAULT '10:00',
  work_end text NOT NULL DEFAULT '21:00',
  lock_minutes int NOT NULL DEFAULT 10,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
GRANT SELECT, INSERT, UPDATE ON public.call_queue_settings TO authenticated;
GRANT ALL ON public.call_queue_settings TO service_role;
ALTER TABLE public.call_queue_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cq settings staff read" ON public.call_queue_settings;
CREATE POLICY "cq settings staff read" ON public.call_queue_settings FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
DROP POLICY IF EXISTS "cq settings admin insert" ON public.call_queue_settings;
CREATE POLICY "cq settings admin insert" ON public.call_queue_settings FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())) AND au.role = 'admin' AND au.is_active));
DROP POLICY IF EXISTS "cq settings admin update" ON public.call_queue_settings;
CREATE POLICY "cq settings admin update" ON public.call_queue_settings FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())) AND au.role = 'admin' AND au.is_active)) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.operator_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  paused boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS operator_shifts_operator_started_idx ON public.operator_shifts (operator, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.operator_shifts TO authenticated;
GRANT ALL ON public.operator_shifts TO service_role;
ALTER TABLE public.operator_shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shifts staff read" ON public.operator_shifts;
CREATE POLICY "shifts staff read" ON public.operator_shifts FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
DROP POLICY IF EXISTS "shifts own insert" ON public.operator_shifts;
CREATE POLICY "shifts own insert" ON public.operator_shifts FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()) AND lower(operator) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));
DROP POLICY IF EXISTS "shifts own update" ON public.operator_shifts;
CREATE POLICY "shifts own update" ON public.operator_shifts FOR UPDATE TO authenticated USING (lower(operator) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))) WITH CHECK (lower(operator) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS queue_locked_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS queue_locked_until timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS queue_last_touched_by text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS queue_extra_attempts int;
CREATE INDEX IF NOT EXISTS orders_call_queue_open_idx ON public.orders (created_at) WHERE status IN ('new','on_hold','pending_bump');

CREATE OR REPLACE FUNCTION public.call_queue_cfg()
RETURNS public.call_queue_settings LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.call_queue_settings;
BEGIN
  SELECT * INTO r FROM public.call_queue_settings WHERE id = true;
  IF NOT FOUND THEN
    r.id := true; r.enabled_operators := '{}'; r.manager_emails := '{eto@bigmart.ge}';
    r.retry_gap_minutes := 120; r.max_attempts := 3; r.work_start := '10:00'; r.work_end := '21:00'; r.lock_minutes := 10;
  END IF;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_cfg() FROM public, anon;

CREATE OR REPLACE FUNCTION public.call_queue_actor()
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_cfg public.call_queue_settings;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  v_cfg := public.call_queue_cfg();
  IF EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'admin') THEN RETURN v_email; END IF;
  IF lower(v_email) = ANY (SELECT lower(x) FROM unnest(v_cfg.enabled_operators) x) THEN RETURN v_email; END IF;
  RAISE EXCEPTION 'call queue not enabled for this user';
END $$;
REVOKE ALL ON FUNCTION public.call_queue_actor() FROM public, anon;

CREATE OR REPLACE FUNCTION public.call_queue_is_manager()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text;
BEGIN
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  IF v_email IS NULL OR NOT public.is_active_admin(auth.uid()) THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = lower(v_email) AND au.role = 'admin')
    OR lower(v_email) = ANY (SELECT lower(x) FROM unnest((public.call_queue_cfg()).manager_emails) x);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_is_manager() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_is_manager() TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_store_match(p_order_id uuid, p_store text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN p_store IS NULL OR p_store NOT IN ('A','B') THEN true
    WHEN NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = p_order_id) THEN p_store = 'B'
    ELSE EXISTS (
      SELECT 1 FROM public.order_items i
      LEFT JOIN public.products pi ON pi.id = i.product_id
      LEFT JOIN LATERAL (SELECT ps.warehouse FROM public.products ps
        WHERE lower(trim(ps.sku)) = lower(trim(coalesce(i.sku, ''))) LIMIT 1) ps ON true
      WHERE i.order_id = p_order_id
        AND (CASE WHEN pi.id IS NOT NULL THEN (CASE WHEN pi.warehouse = 'A' THEN 'A' ELSE 'B' END)
                  WHEN ps.warehouse IS NOT NULL THEN (CASE WHEN ps.warehouse = 'A' THEN 'A' ELSE 'B' END)
                  ELSE 'B' END) = p_store)
  END
$$;
REVOKE ALL ON FUNCTION public.call_queue_store_match(uuid, text) FROM public, anon;

CREATE OR REPLACE FUNCTION public.call_queue_is_open(o public.orders)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT o.status IN ('new','on_hold','pending_bump')
    AND COALESCE(o.is_return, false) = false
    AND COALESCE(o.auto_confirmed, false) = false
    AND COALESCE(o.is_confirmed, false) = false
    AND COALESCE(o.is_fulfilled, false) = false
    AND NOT (COALESCE(o.tags, '{}') @> ARRAY['test_sku'])
$$;

CREATE OR REPLACE FUNCTION public.call_queue_tier(o public.orders, p_caller text, p_gap_minutes int)
RETURNS int LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN NOT public.call_queue_is_open(o) THEN NULL
    WHEN o.next_call_after IS NOT NULL AND o.next_call_after > now() THEN NULL
    WHEN o.queue_locked_until IS NOT NULL AND o.queue_locked_until > now() AND lower(coalesce(o.queue_locked_by,'')) <> lower(p_caller) THEN NULL
    WHEN o.call_outcome = 'callback' AND lower(coalesce(o.queue_last_touched_by,'')) = lower(p_caller) THEN 1
    WHEN COALESCE(o.call_attempt_count, 0) = 0 AND COALESCE(o.call_outcome, '') <> 'callback' THEN 2
    WHEN o.call_outcome = 'callback' THEN
      CASE WHEN o.queue_last_touched_by IS NULL OR o.next_call_after IS NULL OR o.next_call_after <= now() - interval '30 minutes' THEN 3 ELSE NULL END
    WHEN o.next_call_after IS NULL AND o.last_call_attempt_at IS NOT NULL AND o.last_call_attempt_at > now() - make_interval(mins => p_gap_minutes) THEN NULL
    ELSE 4
  END
$$;

CREATE OR REPLACE FUNCTION public.call_queue_next(p_store text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg(); v_id uuid; v_until timestamptz;
BEGIN
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

CREATE OR REPLACE FUNCTION public.call_queue_release(p_order_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor();
BEGIN
  UPDATE public.orders SET queue_locked_by = NULL, queue_locked_until = NULL, queue_last_touched_by = v_actor
  WHERE id = p_order_id AND (queue_locked_by IS NULL OR lower(queue_locked_by) = lower(v_actor) OR queue_locked_until IS NULL OR queue_locked_until <= now());
END $$;
REVOKE ALL ON FUNCTION public.call_queue_release(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_release(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_compute_retry(p_attempts int, p_first_at timestamptz, p_now timestamptz, p_gap int, p_max int, p_work_start text, p_work_end text)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_now_l timestamp := p_now AT TIME ZONE 'Asia/Tbilisi';
  v_first_l timestamp := coalesce(p_first_at, p_now) AT TIME ZONE 'Asia/Tbilisi';
  v_cand_l timestamp; v_other_half time;
  v_ws time := p_work_start::time; v_we time := p_work_end::time;
BEGIN
  IF p_attempts >= p_max THEN RETURN NULL; END IF;
  IF extract(hour FROM v_first_l) < 14 THEN v_other_half := '15:00'; ELSE v_other_half := '11:00'; END IF;
  IF p_attempts <= 1 THEN
    v_cand_l := v_now_l + make_interval(mins => p_gap);
    IF v_cand_l::date > v_now_l::date OR v_cand_l::time > v_we THEN
      v_cand_l := (v_now_l::date + 1) + v_other_half;
    ELSIF v_cand_l::time < v_ws THEN
      v_cand_l := v_cand_l::date + v_ws;
    END IF;
  ELSE
    v_cand_l := (v_now_l::date + 1) + v_other_half;
  END IF;
  RETURN v_cand_l AT TIME ZONE 'Asia/Tbilisi';
END $$;

CREATE OR REPLACE FUNCTION public.call_queue_schedule_retry(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); v_cfg public.call_queue_settings := public.call_queue_cfg();
  o public.orders; v_first timestamptz; v_max int; v_at timestamptz;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT min((e->>'at')::timestamptz) INTO v_first
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.call_attempt_history) = 'array' THEN o.call_attempt_history ELSE '[]'::jsonb END) e
  WHERE e->>'outcome' = 'no_answer';
  v_max := v_cfg.max_attempts + COALESCE(o.queue_extra_attempts, 0);
  v_at := public.call_queue_compute_retry(COALESCE(o.call_attempt_count, 0), COALESCE(v_first, o.last_call_attempt_at, now()), now(),
    v_cfg.retry_gap_minutes, v_max, v_cfg.work_start, v_cfg.work_end);
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
    SELECT o.* FROM public.orders o
    WHERE o.status IN ('new','on_hold','pending_bump') AND public.call_queue_is_open(o) AND public.call_queue_store_match(o.id, p_store)
  )
  SELECT jsonb_build_object(
    'fresh_waiting', count(*) FILTER (WHERE COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'callbacks_due', count(*) FILTER (WHERE call_outcome = 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_due', count(*) FILTER (WHERE COALESCE(call_attempt_count,0) > 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())),
    'retries_later_today', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today),
    'retries_tomorrow', count(*) FILTER (WHERE COALESCE(call_outcome,'') <> 'callback' AND next_call_after > now() AND (next_call_after AT TIME ZONE 'Asia/Tbilisi')::date = v_today + 1),
    'locked_now', count(*) FILTER (WHERE queue_locked_until > now()),
    'oldest_fresh_seconds', extract(epoch FROM now() - min(created_at) FILTER (WHERE COALESCE(call_attempt_count,0) = 0 AND COALESCE(call_outcome,'') <> 'callback' AND (next_call_after IS NULL OR next_call_after <= now())))::int
  ) INTO r FROM open;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_stats(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_stats(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_team_locks()
RETURNS TABLE(order_id uuid, order_number text, locked_by text, locked_until timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.call_queue_is_manager() THEN RAISE EXCEPTION 'not authorized'; END IF;
  RETURN QUERY SELECT o.id, o.public_order_number::text, o.queue_locked_by, o.queue_locked_until
  FROM public.orders o WHERE o.queue_locked_until > now() AND o.status IN ('new','on_hold','pending_bump');
END $$;
REVOKE ALL ON FUNCTION public.call_queue_team_locks() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_team_locks() TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_assign(p_order_id uuid, p_operator text)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me text;
BEGIN
  IF NOT public.call_queue_is_manager() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT email INTO v_me FROM auth.users WHERE id = auth.uid();
  UPDATE public.orders SET queue_locked_by = p_operator, queue_locked_until = now() + interval '30 minutes' WHERE id = p_order_id;
  INSERT INTO public.order_events(order_id, actor, event_type, payload)
  VALUES (p_order_id, v_me, 'queue_assign', jsonb_build_object('operator', p_operator));
END $$;
REVOKE ALL ON FUNCTION public.call_queue_assign(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_assign(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_force_release(p_order_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.call_queue_is_manager() THEN RAISE EXCEPTION 'not authorized'; END IF;
  UPDATE public.orders SET queue_locked_by = NULL, queue_locked_until = NULL WHERE id = p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.call_queue_force_release(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_force_release(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.call_queue_override(p_order_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me text;
BEGIN
  IF NOT public.call_queue_is_manager() THEN RAISE EXCEPTION 'not authorized'; END IF;
  SELECT email INTO v_me FROM auth.users WHERE id = auth.uid();
  UPDATE public.orders SET next_call_after = now(), queue_extra_attempts = COALESCE(queue_extra_attempts, 0) + 1 WHERE id = p_order_id;
  INSERT INTO public.order_events(order_id, actor, event_type, payload)
  VALUES (p_order_id, v_me, 'queue_override', jsonb_build_object('extra_attempt', true));
END $$;
REVOKE ALL ON FUNCTION public.call_queue_override(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_override(uuid) TO authenticated;