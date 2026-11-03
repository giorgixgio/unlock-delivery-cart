ALTER TABLE public.courier_shipments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'excel',
  ADD COLUMN IF NOT EXISTS source_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS onway_parent_tracking text;
ALTER TABLE public.courier_status_history ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'excel';
ALTER TABLE public.courier_status_map ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS courier_shipments_source_idx ON public.courier_shipments (source, derived_state);

INSERT INTO public.courier_status_map (courier_status, label_ka, label_en, outbound_state, outbound_is_final, return_state, return_is_final, sort_order)
VALUES ('აღების გადადება', 'აღების გადადება', 'Pickup postponed', 'IN_PROGRESS', false, 'IN_PROGRESS', false, 15)
ON CONFLICT (courier_status) DO NOTHING;

INSERT INTO public.courier_alert_settings (rule_key, label, threshold_days, sort_order)
VALUES ('webhook_silent', 'Onway webhook silent (hours, working days 10–20)', 3, 200)
ON CONFLICT (rule_key) DO NOTHING;

INSERT INTO public.internal_job_secrets (name) VALUES ('onway_status_pull') ON CONFLICT (name) DO NOTHING;

-- Single write path for API (webhook/pull) shipments. Newer-wins on source_status_at; finalized rows immutable.
CREATE OR REPLACE FUNCTION public.courier_upsert_shipment(p_row jsonb, p_history jsonb, p_source text DEFAULT 'api')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tn text := nullif(btrim(p_row->>'tracking_number'), '');
  v_at timestamptz := nullif(p_row->>'source_status_at', '')::timestamptz;
  v_ex public.courier_shipments%ROWTYPE;
  v_id uuid; v_result text; v_hist int := 0;
  v_order uuid; v_parent text := nullif(btrim(p_row->>'onway_parent_tracking'), '');
  v_is_return boolean := coalesce((p_row->>'is_return')::boolean, false);
  v_final constant text[] := ARRAY['DELIVERED','FAILED_FINAL','RETURNED_FAILED','CANCELLED_EXCLUDED','RETURN_COLLECTED','RETURN_FAILED','RETURN_CANCELLED'];
BEGIN
  IF v_tn IS NULL THEN RETURN jsonb_build_object('result','skipped'); END IF;
  SELECT * INTO v_ex FROM public.courier_shipments WHERE tracking_number = v_tn FOR UPDATE;

  IF FOUND AND v_ex.derived_state = ANY(v_final) THEN
    v_id := v_ex.id; v_result := 'final_locked';
  ELSIF FOUND AND v_ex.source_status_at IS NOT NULL AND (v_at IS NULL OR v_at < v_ex.source_status_at) THEN
    v_id := v_ex.id; v_result := 'older_ignored';
  ELSIF FOUND AND v_ex.current_courier_status IS NOT DISTINCT FROM (p_row->>'current_courier_status')
        AND v_ex.source_status_at IS NOT DISTINCT FROM v_at THEN
    v_id := v_ex.id; v_result := 'unchanged';
    UPDATE public.courier_shipments SET last_seen_at = now() WHERE id = v_id;
  ELSIF FOUND THEN
    UPDATE public.courier_shipments s SET
      current_courier_status = p_row->>'current_courier_status',
      derived_state = p_row->>'derived_state', derived_status = p_row->>'derived_status',
      shipment_type = p_row->>'shipment_type', is_return = v_is_return,
      latest_status_date = v_at, source_status_at = v_at,
      status_changed_at = CASE WHEN s.current_courier_status IS DISTINCT FROM p_row->>'current_courier_status' THEN coalesce(v_at, now()) ELSE s.status_changed_at END,
      final_status_date = nullif(p_row->>'final_status_date','')::timestamptz,
      pickup_date = coalesce(s.pickup_date, nullif(p_row->>'pickup_date','')::timestamptz),
      order_date = coalesce(s.order_date, nullif(p_row->>'order_date','')::timestamptz),
      order_number = coalesce(s.order_number, nullif(p_row->>'order_number','')),
      phone = coalesce(nullif(s.phone,''), nullif(p_row->>'phone','')),
      customer_name = coalesce(nullif(s.customer_name,''), nullif(p_row->>'customer_name','')),
      city = coalesce(nullif(s.city,''), nullif(p_row->>'city','')),
      address = coalesce(nullif(s.address,''), nullif(p_row->>'address','')),
      sender_name = coalesce(s.sender_name, nullif(p_row->>'sender_name','')),
      receiver_name = coalesce(s.receiver_name, nullif(p_row->>'receiver_name','')),
      cod_amount = coalesce((p_row->>'cod_amount')::numeric, s.cod_amount),
      company_receives = coalesce((p_row->>'company_receives')::numeric, s.company_receives),
      comment_raw = coalesce(nullif(s.comment_raw,''), nullif(p_row->>'comment_raw','')),
      comment_items = CASE WHEN coalesce(jsonb_array_length(s.comment_items),0) = 0 THEN coalesce(p_row->'comment_items','[]'::jsonb) ELSE s.comment_items END,
      onway_parent_tracking = coalesce(s.onway_parent_tracking, v_parent),
      source = p_source, last_seen_at = now(), updated_at = now()
    WHERE s.id = v_ex.id;
    v_id := v_ex.id; v_result := 'updated';
  ELSE
    INSERT INTO public.courier_shipments (tracking_number, order_number, phone, customer_name, city, address,
      cod_amount, company_receives, current_courier_status, derived_state, derived_status, shipment_type, is_return,
      sender_name, receiver_name, order_date, pickup_date, final_status_date, comment_raw, comment_items,
      first_seen_at, last_seen_at, latest_status_date, status_changed_at, source_status_at, onway_parent_tracking, source)
    VALUES (v_tn, nullif(p_row->>'order_number',''), nullif(p_row->>'phone',''), nullif(p_row->>'customer_name',''),
      nullif(p_row->>'city',''), nullif(p_row->>'address',''), (p_row->>'cod_amount')::numeric, (p_row->>'company_receives')::numeric,
      p_row->>'current_courier_status', p_row->>'derived_state', p_row->>'derived_status', p_row->>'shipment_type', v_is_return,
      nullif(p_row->>'sender_name',''), nullif(p_row->>'receiver_name',''), nullif(p_row->>'order_date','')::timestamptz,
      nullif(p_row->>'pickup_date','')::timestamptz, nullif(p_row->>'final_status_date','')::timestamptz,
      nullif(p_row->>'comment_raw',''), coalesce(p_row->'comment_items','[]'::jsonb),
      now(), now(), v_at, coalesce(v_at, now()), v_at, v_parent, p_source)
    RETURNING id INTO v_id;
    v_result := 'inserted';
  END IF;

  -- Full timeline, deduped by the existing (shipment, status, date) unique index.
  INSERT INTO public.courier_status_history (courier_shipment_id, tracking_number, courier_status, derived_status, status_date, cod_amount, company_receives, raw_row_json, source)
  SELECT v_id, v_tn, h.courier_status, NULL, h.status_date, (p_row->>'cod_amount')::numeric, (p_row->>'company_receives')::numeric,
         jsonb_build_object('comment', h.comment, 'status_id', h.status_id), p_source
  FROM jsonb_to_recordset(coalesce(p_history,'[]'::jsonb)) AS h(courier_status text, status_date timestamptz, comment text, status_id text)
  WHERE nullif(h.courier_status,'') IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_hist = ROW_COUNT;

  IF v_result IN ('inserted','updated') THEN
    IF NOT v_is_return THEN
      SELECT id INTO v_order FROM public.orders WHERE onway_tracking = v_tn LIMIT 1;
      IF v_order IS NOT NULL THEN
        UPDATE public.courier_shipments SET original_order_id = v_order WHERE id = v_id AND original_order_id IS DISTINCT FROM v_order;
        UPDATE public.orders SET courier_status = p_row->>'current_courier_status',
               tracking_number = coalesce(nullif(tracking_number,''), v_tn)
         WHERE id = v_order;
      ELSE
        PERFORM public.courier_sync_orders(NULL, jsonb_build_array(jsonb_build_object(
          'tracking', v_tn, 'order_number', p_row->>'order_number', 'status', p_row->>'current_courier_status')));
      END IF;
    ELSIF v_parent IS NOT NULL AND EXISTS (SELECT 1 FROM public.courier_shipments WHERE tracking_number = v_parent) THEN
      UPDATE public.courier_shipments r SET linked_original_tracking_number = v_parent,
             original_order_id = coalesce(r.original_order_id, (SELECT original_order_id FROM public.courier_shipments WHERE tracking_number = v_parent))
       WHERE r.id = v_id;
      UPDATE public.courier_shipments SET linked_return_tracking_number = v_tn WHERE tracking_number = v_parent;
    ELSE
      PERFORM public.courier_link_returns(ARRAY[v_tn]);
    END IF;
  END IF;

  RETURN jsonb_build_object('result', v_result, 'history_added', v_hist, 'shipment_id', v_id);
END $$;
REVOKE ALL ON FUNCTION public.courier_upsert_shipment(jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.courier_upsert_shipment(jsonb, jsonb, text) TO service_role;