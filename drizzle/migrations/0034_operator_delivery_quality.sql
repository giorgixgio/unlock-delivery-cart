CREATE OR REPLACE FUNCTION public.operator_delivery_quality(p_from timestamptz, p_to timestamptz)
RETURNS TABLE(order_id uuid, operator text, total numeric, status text, matched boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  RETURN QUERY
  WITH conf AS (
    SELECT DISTINCT ON (e.order_id) e.order_id, e.actor, e.payload
    FROM public.order_events e
    WHERE e.event_type = 'call_outcome' AND e.created_at >= p_from AND e.created_at <= p_to
      AND e.payload->>'outcome' IN ('confirmed','cancelled')
      AND COALESCE(e.payload->>'source','') <> 'duplicate_cleanup'
      AND COALESCE(e.payload->>'cancel_reason','') <> 'duplicate_order'
    ORDER BY e.order_id, e.created_at DESC, e.id DESC
  )
  SELECT c.order_id, c.actor, o.total::numeric,
    COALESCE(s.derived_status, CASE WHEN o.status = 'canceled' THEN 'CANCELLED_BEFORE_COURIER' ELSE 'UNMATCHED' END),
    s.derived_status IS NOT NULL
  FROM conf c
  JOIN public.orders o ON o.id = c.order_id
  LEFT JOIN LATERAL (
    SELECT cs.derived_status FROM public.courier_shipments cs
    WHERE COALESCE(cs.is_return, false) = false
      AND (cs.order_number = o.public_order_number::text OR (o.tracking_number IS NOT NULL AND cs.tracking_number = o.tracking_number))
    ORDER BY cs.last_seen_at DESC NULLS LAST LIMIT 1
  ) s ON true
  WHERE c.payload->>'outcome' = 'confirmed';
END $$;
REVOKE ALL ON FUNCTION public.operator_delivery_quality(timestamptz, timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.operator_delivery_quality(timestamptz, timestamptz) TO authenticated;