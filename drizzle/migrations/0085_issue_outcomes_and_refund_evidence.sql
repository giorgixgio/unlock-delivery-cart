ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS evidence_required boolean NOT NULL DEFAULT false;
ALTER TABLE public.refund_requests ADD COLUMN IF NOT EXISTS evidence jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE POLICY "Staff read refund evidence" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'refund-evidence' AND public.is_active_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.support_ticket_replace(p_request_id uuid, p_note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor text := public.support_actor(); t customer_requests%ROWTYPE; o orders%ROWTYPE; v_new uuid; v_num text; v_count int;
BEGIN
  IF NOT public.is_active_staff(auth.uid()) THEN RAISE EXCEPTION 'not allowed' USING ERRCODE='42501'; END IF;
  SELECT * INTO t FROM customer_requests WHERE id = p_request_id AND kind = 'operator_flag' FOR UPDATE;
  IF NOT FOUND OR t.status NOT IN ('open','in_review','waiting_customer') THEN RAISE EXCEPTION 'ticket not open'; END IF;
  SELECT * INTO o FROM orders WHERE id = t.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'order not found'; END IF;
  SELECT count(*) INTO v_count FROM order_items WHERE order_id = o.id AND coalesce(unit_price,0) > 0;
  IF v_count = 0 THEN RAISE EXCEPTION 'no items to replace'; END IF;

  -- Close the ticket first so the new order is not held as a duplicate of an open issue.
  UPDATE customer_requests SET status = 'resolved', resolution = 'replacement', resolved_at = now(), resolved_by = v_actor, staff_seen_at = now() WHERE id = t.id;
  UPDATE sms_queue SET status = 'skipped', last_error = 'ticket_resolved' WHERE request_id = t.id AND status = 'pending';

  PERFORM set_config('app.call_queue_rpc', '1', true);
  INSERT INTO orders (public_order_number, status, original_order_id, internal_note, payment_method, source, channel,
    customer_name, customer_phone, customer_email, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address,
    is_tbilisi, subtotal, shipping_fee, discount_total, total, is_confirmed, is_fulfilled, address_status, tags)
  VALUES ('', 'new', o.id, 'FREE REPLACEMENT for #' || o.public_order_number || ' — collect 0₾' || CASE WHEN coalesce(trim(p_note),'') <> '' THEN ' | ' || trim(p_note) ELSE '' END,
    'COD', 'return', 'admin', o.customer_name, o.customer_phone, o.customer_email, coalesce(o.city,''), coalesce(o.region,''), coalesce(o.address_line1,''), o.address_line2,
    o.raw_city, o.raw_address, o.normalized_city, o.normalized_address, coalesce(o.is_tbilisi,false), 0, 0, 0, 0, false, false, 'completed', ARRAY['replacement','support_replacement'])
  RETURNING id, public_order_number INTO v_new, v_num;
  INSERT INTO order_items (order_id, product_id, sku, title, quantity, unit_price, line_total, image_url)
  SELECT v_new, product_id, sku, title, quantity, 0, 0, coalesce(image_url,'') FROM order_items WHERE order_id = o.id AND coalesce(unit_price,0) > 0;
  -- Confirming via UPDATE runs the normal once-only stock deduction (test orders stay unconfirmed by the isolation guard).
  UPDATE orders SET status = 'confirmed', is_confirmed = true, support_hold = false WHERE id = v_new;

  INSERT INTO order_events (order_id, actor, event_type, payload) VALUES
    (v_new, v_actor, 'replacement_created', jsonb_build_object('original_order_id', o.id, 'original_order_number', o.public_order_number, 'ticket_id', t.id, 'note', p_note)),
    (o.id, v_actor, 'replacement_requested', jsonb_build_object('replacement_order_id', v_new, 'replacement_order_number', v_num, 'ticket_id', t.id));
  INSERT INTO support_ticket_messages (request_id, author_type, author, body, status_set)
  VALUES (t.id, 'system', v_actor, '📦 უფასო შეცვლა: ახალი შეკვეთა #' || v_num || ' (0₾, დადასტურებული)' || coalesce(' — ' || nullif(trim(p_note),''), ''), 'resolved');
  RETURN jsonb_build_object('id', v_new, 'public_order_number', v_num);
END $$;
REVOKE ALL ON FUNCTION public.support_ticket_replace(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_replace(uuid, text) TO authenticated;