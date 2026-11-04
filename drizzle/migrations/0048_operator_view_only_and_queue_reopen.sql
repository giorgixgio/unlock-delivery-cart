-- 1) Who is a "queue-only" operator (operator role, master switch on, not a listed manager).
CREATE OR REPLACE FUNCTION public.is_queue_only_operator(p_uid uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_cfg public.call_queue_settings;
BEGIN
  IF p_uid IS NULL THEN RETURN false; END IF;
  SELECT lower(email) INTO v_email FROM auth.users WHERE id = p_uid;
  IF v_email IS NULL THEN RETURN false; END IF;
  v_cfg := public.call_queue_cfg();
  IF NOT coalesce(v_cfg.operators_use_queue, false) THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.admin_users au WHERE lower(au.email) = v_email AND au.role = 'operator' AND au.is_active) THEN RETURN false; END IF;
  RETURN NOT (v_email = ANY (SELECT lower(x) FROM unnest(coalesce(v_cfg.manager_emails, '{}')) x));
END $$;
REVOKE ALL ON FUNCTION public.is_queue_only_operator(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_queue_only_operator(uuid) TO authenticated, service_role;

-- 2) True when the operator holds the queue lock on this order or on another order of the same customer.
CREATE OR REPLACE FUNCTION public.operator_holds_customer_lock(p_order_id uuid, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cur AS (SELECT id, phone_last9 FROM public.orders WHERE id = p_order_id)
  SELECT EXISTS (
    SELECT 1 FROM public.orders o, cur
    WHERE lower(coalesce(o.queue_locked_by, '')) = lower(coalesce(p_email, '-'))
      AND (o.id = cur.id OR (length(coalesce(cur.phone_last9, '')) >= 9 AND o.phone_last9 = cur.phone_last9))
  )
$$;
REVOKE ALL ON FUNCTION public.operator_holds_customer_lock(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.operator_holds_customer_lock(uuid, text) TO authenticated, service_role;

-- 3) Server-side view-only rule: queue-only operators change orders only from the Call Queue
--    (while holding that customer's queue lock). Queue RPCs mark themselves with app.call_queue_rpc.
CREATE OR REPLACE FUNCTION public.orders_operator_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_skip text[] := ARRAY['queue_locked_by','queue_locked_until','queue_last_touched_by','operator_viewed_at','operator_viewed_by','updated_at','phone_last9'];
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('app.call_queue_rpc', true), '') = '1' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT public.is_queue_only_operator(auth.uid()) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'View only: operators cannot delete orders' USING ERRCODE = '42501'; END IF;
  IF (to_jsonb(NEW) - v_skip) = (to_jsonb(OLD) - v_skip) THEN RETURN NEW; END IF;
  IF public.operator_holds_customer_lock(OLD.id, auth.jwt()->>'email') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'View only: operators change orders only from the Call Queue' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS orders_operator_guard_trg ON public.orders;
CREATE TRIGGER orders_operator_guard_trg BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_operator_guard();

CREATE OR REPLACE FUNCTION public.order_items_operator_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR coalesce(current_setting('app.call_queue_rpc', true), '') = '1' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT public.is_queue_only_operator(auth.uid()) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF public.operator_holds_customer_lock(COALESCE(NEW.order_id, OLD.order_id), auth.jwt()->>'email') THEN RETURN COALESCE(NEW, OLD); END IF;
  RAISE EXCEPTION 'View only: operators change order items only from the Call Queue' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS order_items_operator_guard_trg ON public.order_items;
CREATE TRIGGER order_items_operator_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.order_items_operator_guard();

-- 4) Stock log: rows retired when a cancelled order is reopened.
ALTER TABLE public.stock_activity_log DROP CONSTRAINT IF EXISTS stock_activity_log_change_type_check;
ALTER TABLE public.stock_activity_log ADD CONSTRAINT stock_activity_log_change_type_check CHECK (change_type = ANY (ARRAY[
  'manual_set','manual_adjust','order_confirm','order_cancel_restore','order_confirm_undone','order_cancel_restore_undone',
  'order_confirm_reopened','order_cancel_restore_reopened']));

-- 5) Reopen a cancelled order before a new outcome (confirm / callback) is recorded from the Call Queue.
CREATE OR REPLACE FUNCTION public.call_queue_reopen(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor(); o public.orders; v_restored int; v_retired int := 0; v_event uuid;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.status NOT IN ('canceled', 'cancelled') THEN RETURN jsonb_build_object('reopened', false); END IF;
  IF coalesce(o.is_return, false) OR o.merged_into_order_id IS NOT NULL OR coalesce(o.is_fulfilled, false)
     OR o.onway_sent_at IS NOT NULL OR coalesce(o.onway_tracking, '') <> '' OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL THEN
    RAISE EXCEPTION 'reopen: order already left the call stage';
  END IF;
  IF NOT public.call_queue_is_manager() AND lower(coalesce(o.queue_locked_by, '')) <> lower(v_actor) THEN
    RAISE EXCEPTION 'reopen: open the order in the Call Queue first';
  END IF;
  PERFORM set_config('app.call_queue_rpc', '1', true);
  -- If the cancel put stock back, retire the confirm/restore pair so the next confirm deducts again.
  -- If the cancel kept stock out, keep the deduction and retire only the restore marker.
  SELECT coalesce(sum(delta), 0) INTO v_restored FROM public.stock_activity_log
  WHERE order_id = p_order_id AND change_type = 'order_cancel_restore';
  UPDATE public.stock_activity_log SET change_type = change_type || '_reopened',
    comment = coalesce(comment, '') || ' — order reopened by ' || v_actor
  WHERE order_id = p_order_id
    AND change_type = ANY (CASE WHEN v_restored > 0 THEN ARRAY['order_confirm','order_cancel_restore'] ELSE ARRAY['order_cancel_restore'] END);
  GET DIAGNOSTICS v_retired = ROW_COUNT;
  UPDATE public.orders SET final_cancel_reason = NULL, final_cancel_note = NULL, canceled_after_attempts = false WHERE id = p_order_id;
  INSERT INTO public.order_events(order_id, actor, event_type, payload)
  VALUES (p_order_id, v_actor, 'order_reopened', jsonb_build_object(
    'previous_status', o.status, 'previous_cancel_reason', o.final_cancel_reason, 'previous_cancel_note', o.final_cancel_note,
    'stock_rows_retired', v_retired, 'source', 'call_queue'))
  RETURNING id INTO v_event;
  RETURN jsonb_build_object('reopened', true, 'event_id', v_event);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_reopen(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_reopen(uuid) TO authenticated;

-- 6) Release a lock taken only for viewing (search-open) without touching queue position.
CREATE OR REPLACE FUNCTION public.call_queue_release_view(p_order_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor text := public.call_queue_actor();
BEGIN
  UPDATE public.orders SET queue_locked_by = NULL, queue_locked_until = NULL
  WHERE id = p_order_id AND lower(coalesce(queue_locked_by, '')) = lower(v_actor);
END $$;
REVOKE ALL ON FUNCTION public.call_queue_release_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_release_view(uuid) TO authenticated;

-- 7) Undo: also accept a cancelled snapshot (undo of a reopen) and mark itself as a queue RPC.
CREATE OR REPLACE FUNCTION public.call_queue_undo(p_order_id uuid, p_snapshot jsonb, p_event_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor text := public.call_queue_actor();
  v_cfg public.call_queue_settings := public.call_queue_cfg();
  v_taken timestamptz := (p_snapshot->>'taken_at')::timestamptz;
  v_by text := p_snapshot->>'actor';
  v_status text := p_snapshot->>'status';
  o public.orders; r record; v_prev int; v_sms boolean := false; v_renamed int;
BEGIN
  IF v_taken IS NULL OR lower(coalesce(v_by,'')) <> lower(v_actor) THEN RAISE EXCEPTION 'undo: not your action'; END IF;
  IF now() - v_taken > interval '5 minutes' THEN RAISE EXCEPTION 'undo: time window expired'; END IF;
  IF v_status NOT IN ('new','on_hold','pending_bump','pending_details','confirmed','canceled') THEN RAISE EXCEPTION 'undo: invalid snapshot'; END IF;
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  IF o.onway_sent_at IS NOT NULL OR coalesce(o.onway_tracking,'') <> '' THEN RAISE EXCEPTION 'undo: already sent to Onway'; END IF;
  IF coalesce(o.is_fulfilled,false) OR o.packed_at IS NOT NULL OR o.packing_wave_id IS NOT NULL OR o.status IN ('fulfilled','shipped','delivered','packed') THEN
    RAISE EXCEPTION 'undo: already packed or fulfilled'; END IF;
  IF EXISTS (SELECT 1 FROM public.order_events e WHERE e.order_id = p_order_id AND e.created_at >= v_taken
      AND lower(coalesce(e.actor,'')) NOT IN (lower(v_actor), 'system', '')) THEN
    RAISE EXCEPTION 'undo: order changed by someone else'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_event_ids,'{}')) x WHERE NOT EXISTS (
      SELECT 1 FROM public.order_events e WHERE e.id = x AND e.order_id = p_order_id AND lower(e.actor) = lower(v_actor) AND e.created_at >= v_taken - interval '5 seconds')) THEN
    RAISE EXCEPTION 'undo: events do not belong to this action'; END IF;
  PERFORM set_config('app.call_queue_rpc', '1', true);

  FOR r IN SELECT * FROM public.stock_activity_log WHERE order_id = p_order_id AND created_at >= v_taken - interval '5 seconds'
      AND change_type IN ('order_confirm','order_cancel_restore') LOOP
    IF r.product_id IS NOT NULL AND coalesce(r.delta,0) <> 0 THEN
      SELECT coalesce(stock_quantity,0) INTO v_prev FROM public.products WHERE id = r.product_id FOR UPDATE;
      UPDATE public.products SET stock_quantity = GREATEST(v_prev - r.delta, 0) WHERE id = r.product_id;
    END IF;
    UPDATE public.stock_activity_log SET change_type = r.change_type || '_undone',
      comment = coalesce(comment,'') || ' — undone by ' || v_actor WHERE id = r.id;
  END LOOP;

  UPDATE public.orders SET
    status = v_status,
    is_confirmed = coalesce((p_snapshot->>'is_confirmed')::boolean, false),
    call_outcome = p_snapshot->>'call_outcome',
    call_outcome_updated_at = (p_snapshot->>'call_outcome_updated_at')::timestamptz,
    call_outcome_updated_by = p_snapshot->>'call_outcome_updated_by',
    operator_review_status = p_snapshot->>'operator_review_status',
    review_required = coalesce((p_snapshot->>'review_required')::boolean, o.review_required),
    call_attempt_count = coalesce((p_snapshot->>'call_attempt_count')::int, 0),
    last_call_attempt_at = (p_snapshot->>'last_call_attempt_at')::timestamptz,
    last_call_attempt_by = p_snapshot->>'last_call_attempt_by',
    call_attempt_history = NULLIF(p_snapshot->'call_attempt_history', 'null'::jsonb),
    next_call_after = (p_snapshot->>'next_call_after')::timestamptz,
    final_cancel_reason = p_snapshot->>'final_cancel_reason',
    final_cancel_note = p_snapshot->>'final_cancel_note',
    canceled_after_attempts = coalesce((p_snapshot->>'canceled_after_attempts')::boolean, false),
    queue_extra_attempts = (p_snapshot->>'queue_extra_attempts')::int,
    queue_last_touched_by = p_snapshot->>'queue_last_touched_by',
    queue_locked_by = v_actor,
    queue_locked_until = now() + make_interval(mins => v_cfg.lock_minutes)
  WHERE id = p_order_id;

  UPDATE public.order_events SET event_type = event_type || '_undone'
  WHERE id = ANY (coalesce(p_event_ids,'{}')) AND event_type IN ('call_outcome','call_attempt','callback_scheduled','order_canceled','order_reopened');
  GET DIAGNOSTICS v_renamed = ROW_COUNT;

  v_sms := EXISTS (SELECT 1 FROM public.sms_queue q WHERE q.order_id = p_order_id AND q.status = 'sent' AND q.sent_at >= v_taken)
    OR EXISTS (SELECT 1 FROM public.sms_logs l WHERE l.order_number = o.public_order_number::text AND l.created_at >= v_taken
      AND coalesce(l.status,'') NOT IN ('skipped','failed'));
  UPDATE public.sms_queue SET status = 'skipped', last_error = 'outcome undone'
  WHERE order_id = p_order_id AND status = 'pending' AND created_at >= v_taken;

  INSERT INTO public.order_events(order_id, actor, event_type, payload)
  VALUES (p_order_id, v_actor, 'outcome_undone', jsonb_build_object('outcome', p_snapshot->>'outcome', 'taken_at', v_taken,
    'events', to_jsonb(coalesce(p_event_ids,'{}')), 'renamed', v_renamed, 'sms_already_sent', v_sms, 'source', 'call_queue'));
  RETURN jsonb_build_object('ok', true, 'sms_already_sent', v_sms);
END $function$;