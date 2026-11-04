CREATE OR REPLACE FUNCTION public.order_is_delivered(p_order_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM orders o WHERE o.id = p_order_id AND NOT coalesce(o.is_return,false)
    AND (o.status = 'delivered' OR o.onway_last_status = 'ჩაბარდა'
      OR EXISTS (SELECT 1 FROM courier_shipments s WHERE s.original_order_id = o.id AND NOT coalesce(s.is_return,false) AND s.derived_state = 'DELIVERED')))
$$;
REVOKE ALL ON FUNCTION public.order_is_delivered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_is_delivered(uuid) TO authenticated, service_role;

-- One atomic step: free replacement linked to the delivered order; the lead (if different) closes as converted.
CREATE OR REPLACE FUNCTION public.create_replacement_order(p_lead_id uuid, p_original_id uuid, p_items jsonb, p_reason text, p_note text, p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE lead orders%ROWTYPE; orig orders%ROWTYPE; v_new uuid; v_num text; v_count int := 0; it jsonb; src order_items%ROWTYPE; v_qty int; v_note text; v_is_lead boolean;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  IF p_reason NOT IN ('broken','wrong_item','missing_item','other') THEN RAISE EXCEPTION 'invalid reason'; END IF;
  SELECT * INTO lead FROM orders WHERE id = p_lead_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lead not found'; END IF;
  SELECT * INTO orig FROM orders WHERE id = p_original_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'original order not found'; END IF;
  IF NOT public.order_is_delivered(orig.id) THEN RAISE EXCEPTION 'original order is not delivered'; END IF;
  v_is_lead := lead.id <> orig.id;
  IF v_is_lead THEN
    IF coalesce(lead.phone_last9,'') = '' OR lead.phone_last9 IS DISTINCT FROM orig.phone_last9 THEN RAISE EXCEPTION 'original order belongs to another phone'; END IF;
    IF coalesce(lead.tags,'{}') @> ARRAY['converted_to_replacement'] OR lead.status = 'merged' THEN RAISE EXCEPTION 'lead already converted'; END IF;
    IF lead.is_confirmed OR lead.is_fulfilled OR lead.status NOT IN ('new','on_hold','pending_bump','canceled')
      OR lead.onway_sent_at IS NOT NULL OR lead.packed_at IS NOT NULL OR coalesce(lead.is_return,false) THEN
      RAISE EXCEPTION 'lead already confirmed or sent';
    END IF;
  END IF;

  v_note := 'REPLACEMENT for #' || orig.public_order_number || ' — free, no money to collect' || CASE WHEN coalesce(p_note,'') <> '' THEN ' | ' || p_note ELSE '' END;
  PERFORM set_config('app.call_queue_rpc', '1', true);
  INSERT INTO orders (public_order_number, status, is_return, original_order_id, return_reason, internal_note, payment_method, source, channel,
    customer_name, customer_phone, customer_email, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address,
    is_tbilisi, subtotal, shipping_fee, discount_total, total, is_confirmed, is_fulfilled, address_status, tags)
  VALUES ('', 'return_review', true, orig.id, p_reason, v_note, 'COD', 'return', 'admin',
    lead.customer_name, lead.customer_phone, lead.customer_email, coalesce(lead.city,''), coalesce(lead.region,''), coalesce(lead.address_line1,''), lead.address_line2,
    lead.raw_city, lead.raw_address, lead.normalized_city, lead.normalized_address,
    coalesce(lead.is_tbilisi,false), 0, 0, 0, 0, false, false, 'completed', ARRAY['return','replacement'])
  RETURNING id, public_order_number INTO v_new, v_num;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) LOOP
    SELECT * INTO src FROM order_items WHERE id = (it->>'item_id')::uuid AND order_id = orig.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'item not in original order'; END IF;
    v_qty := (it->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > src.quantity THEN RAISE EXCEPTION 'invalid quantity'; END IF;
    INSERT INTO order_items (order_id, product_id, sku, title, quantity, unit_price, line_total, image_url)
    VALUES (v_new, src.product_id, src.sku, src.title, v_qty, 0, 0, coalesce(src.image_url,''));
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'select at least one item'; END IF;

  IF v_is_lead THEN
    UPDATE orders SET status = 'merged', merged_into_order_id = v_new, final_cancel_reason = 'converted_to_replacement',
      final_cancel_note = 'replacement #' || v_num || ' for #' || orig.public_order_number,
      tags = array_append(coalesce(tags,'{}'), 'converted_to_replacement'),
      next_call_after = NULL, queue_locked_by = NULL, queue_locked_until = NULL, updated_at = now()
    WHERE id = lead.id;
    INSERT INTO order_events (order_id, actor, event_type, payload) VALUES (lead.id, p_actor, 'converted_to_replacement',
      jsonb_build_object('replacement_order_id', v_new, 'replacement_order_number', v_num, 'original_order_id', orig.id, 'original_order_number', orig.public_order_number, 'reason', p_reason, 'note', p_note));
  END IF;
  INSERT INTO order_events (order_id, actor, event_type, payload) VALUES
    (v_new, p_actor, 'replacement_created', jsonb_build_object('original_order_id', orig.id, 'original_order_number', orig.public_order_number, 'lead_order_id', CASE WHEN v_is_lead THEN lead.id END, 'lead_order_number', CASE WHEN v_is_lead THEN lead.public_order_number END, 'reason', p_reason, 'note', p_note)),
    (orig.id, p_actor, 'replacement_requested', jsonb_build_object('replacement_order_id', v_new, 'replacement_order_number', v_num, 'lead_order_id', CASE WHEN v_is_lead THEN lead.id END, 'lead_order_number', CASE WHEN v_is_lead THEN lead.public_order_number END, 'reason', p_reason, 'note', p_note));
  RETURN jsonb_build_object('id', v_new, 'public_order_number', v_num, 'lead_closed', v_is_lead);
END $$;
REVOKE ALL ON FUNCTION public.create_replacement_order(uuid, uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_replacement_order(uuid, uuid, jsonb, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.operator_customer_history(p_order_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE cur record; res jsonb;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'not allowed'; END IF;
  SELECT id, phone_last9, cookie_id_hash INTO cur FROM orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  WITH m AS (
    SELECT o.*, CASE WHEN length(cur.phone_last9) >= 9 AND o.phone_last9 = cur.phone_last9 THEN 'phone' ELSE 'device' END AS match_type
    FROM orders o
    WHERE o.id <> cur.id
      AND ((length(cur.phone_last9) >= 9 AND o.phone_last9 = cur.phone_last9)
        OR (cur.cookie_id_hash IS NOT NULL AND o.cookie_id_hash = cur.cookie_id_hash))
      AND NOT coalesce(o.tags, '{}') @> ARRAY['test_sku']
      AND ((coalesce(o.source, '') <> 'return' AND NOT coalesce(o.is_return, false)) OR coalesce(o.tags,'{}') @> ARRAY['replacement'])
    ORDER BY o.created_at DESC LIMIT 20
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'public_order_number', m.public_order_number, 'created_at', m.created_at,
    'status', m.status, 'total', m.total, 'call_attempt_count', m.call_attempt_count,
    'match_type', m.match_type, 'onway_sent_at', m.onway_sent_at, 'onway_last_status', m.onway_last_status,
    'is_replacement', coalesce(m.tags,'{}') @> ARRAY['replacement'],
    'replacement_for', (SELECT x.public_order_number FROM orders x WHERE x.id = m.original_order_id AND coalesce(m.tags,'{}') @> ARRAY['replacement']),
    'order_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'sku', i.sku, 'quantity', i.quantity)), '[]') FROM order_items i WHERE i.order_id = m.id),
    'shipment', (SELECT jsonb_build_object('derived_state', s.derived_state, 'status', s.current_courier_status, 'at', coalesce(s.latest_status_date::text, s.updated_at::text), 'source', s.source)
                 FROM courier_shipments s WHERE s.original_order_id = m.id AND NOT coalesce(s.is_return, false)
                 ORDER BY s.updated_at DESC NULLS LAST LIMIT 1),
    'failures', (SELECT coalesce(jsonb_agg(jsonb_build_object('at', coalesce(e.event_time, e.created_at), 'status', e.status_name, 'code', e.reason, 'comment', e.comment, 'ai_reason', e.ai_reason) ORDER BY coalesce(e.event_time, e.created_at)), '[]')
                 FROM onway_status_events e WHERE e.order_id = m.id
                   AND (coalesce(e.reason, '') <> '' OR e.status_name IN ('არ ჩაბარდა', 'არ ჩაბარდა/დასრულებული', 'ჩაბარების გადადება')))
  ) ORDER BY m.created_at DESC), '[]') INTO res FROM m;
  RETURN res;
END $function$;