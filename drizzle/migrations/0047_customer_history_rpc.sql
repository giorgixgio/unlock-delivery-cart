ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS phone_last9 text GENERATED ALWAYS AS (right(regexp_replace(coalesce(customer_phone,''), '\D', '', 'g'), 9)) STORED;
CREATE INDEX IF NOT EXISTS idx_orders_phone_last9 ON public.orders (phone_last9);
CREATE INDEX IF NOT EXISTS idx_orders_cookie_id_hash ON public.orders (cookie_id_hash) WHERE cookie_id_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_onway_status_events_order_id ON public.onway_status_events (order_id);
CREATE INDEX IF NOT EXISTS idx_courier_shipments_original_order_id ON public.courier_shipments (original_order_id);

CREATE OR REPLACE FUNCTION public.operator_customer_history(p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
      AND coalesce(o.source, '') <> 'return' AND NOT coalesce(o.is_return, false)
    ORDER BY o.created_at DESC LIMIT 20
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'public_order_number', m.public_order_number, 'created_at', m.created_at,
    'status', m.status, 'total', m.total, 'call_attempt_count', m.call_attempt_count,
    'match_type', m.match_type, 'onway_sent_at', m.onway_sent_at, 'onway_last_status', m.onway_last_status,
    'order_items', (SELECT coalesce(jsonb_agg(jsonb_build_object('title', i.title, 'sku', i.sku, 'quantity', i.quantity)), '[]') FROM order_items i WHERE i.order_id = m.id),
    'shipment', (SELECT jsonb_build_object('derived_state', s.derived_state, 'status', s.current_courier_status, 'at', coalesce(s.latest_status_date::text, s.updated_at::text), 'source', s.source)
                 FROM courier_shipments s WHERE s.original_order_id = m.id AND NOT coalesce(s.is_return, false)
                 ORDER BY s.updated_at DESC NULLS LAST LIMIT 1),
    'failures', (SELECT coalesce(jsonb_agg(jsonb_build_object('at', coalesce(e.event_time, e.created_at), 'status', e.status_name, 'code', e.reason, 'comment', e.comment, 'ai_reason', e.ai_reason) ORDER BY coalesce(e.event_time, e.created_at)), '[]')
                 FROM onway_status_events e WHERE e.order_id = m.id
                   AND (coalesce(e.reason, '') <> '' OR e.status_name IN ('არ ჩაბარდა', 'არ ჩაბარდა/დასრულებული', 'ჩაბარების გადადება')))
  ) ORDER BY m.created_at DESC), '[]') INTO res FROM m;
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.operator_customer_history(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operator_customer_history(uuid) TO authenticated, service_role;