-- Shift policies: authenticated users cannot read auth.users, so the old policies always failed. Use the JWT email instead.
DROP POLICY IF EXISTS "shifts own insert" ON public.operator_shifts;
CREATE POLICY "shifts own insert" ON public.operator_shifts FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff(auth.uid()) AND lower(operator) = lower(coalesce(auth.jwt()->>'email','')));
DROP POLICY IF EXISTS "shifts own update" ON public.operator_shifts;
CREATE POLICY "shifts own update" ON public.operator_shifts FOR UPDATE TO authenticated
  USING (lower(operator) = lower(coalesce(auth.jwt()->>'email','')))
  WITH CHECK (lower(operator) = lower(coalesce(auth.jwt()->>'email','')));

-- Allow undone stock log rows (additive widening).
ALTER TABLE public.stock_activity_log DROP CONSTRAINT IF EXISTS stock_activity_log_change_type_check;
ALTER TABLE public.stock_activity_log ADD CONSTRAINT stock_activity_log_change_type_check
  CHECK (change_type = ANY (ARRAY['manual_set','manual_adjust','order_confirm','order_cancel_restore','order_confirm_undone','order_cancel_restore_undone']));

CREATE OR REPLACE FUNCTION public.call_queue_undo(p_order_id uuid, p_snapshot jsonb, p_event_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
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
  IF v_status NOT IN ('new','on_hold','pending_bump','confirmed') THEN RAISE EXCEPTION 'undo: invalid snapshot'; END IF;
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

  -- Stock: reverse a deduction or a restore made by this action, and retire its log rows so the
  -- existing once-only stock functions behave normally on the redo.
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
  WHERE id = ANY (coalesce(p_event_ids,'{}')) AND event_type IN ('call_outcome','call_attempt','callback_scheduled','order_canceled');
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
END $$;
REVOKE ALL ON FUNCTION public.call_queue_undo(uuid, jsonb, uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.call_queue_undo(uuid, jsonb, uuid[]) TO authenticated;