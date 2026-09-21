CREATE OR REPLACE FUNCTION public.courier_sync_orders(p_batch_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_by_number int := 0;
  v_by_tracking int := 0;
  v_total int := 0;
BEGIN
  CREATE TEMP TABLE _cr(tracking text, order_number text, status text) ON COMMIT DROP;
  INSERT INTO _cr
  SELECT r.tracking, nullif(r.order_number, ''), r.status
  FROM jsonb_to_recordset(p_rows) AS r(tracking text, order_number text, status text);

  SELECT count(*) INTO v_total FROM _cr;

  WITH upd AS (
    UPDATE public.orders o
    SET courier_status = c.status,
        courier_import_batch_id = p_batch_id,
        tracking_number = COALESCE(o.tracking_number, c.tracking)
    FROM _cr c
    WHERE c.order_number IS NOT NULL
      AND o.public_order_number = c.order_number
    RETURNING 1
  )
  SELECT count(*) INTO v_by_number FROM upd;

  WITH upd2 AS (
    UPDATE public.orders o
    SET courier_status = c.status,
        courier_import_batch_id = p_batch_id
    FROM _cr c
    WHERE o.tracking_number = c.tracking
      AND (c.order_number IS NULL
           OR NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE o2.public_order_number = c.order_number))
    RETURNING 1
  )
  SELECT count(*) INTO v_by_tracking FROM upd2;

  UPDATE public.courier_shipments s
  SET original_order_id = o.id
  FROM public.orders o, _cr c
  WHERE s.tracking_number = c.tracking
    AND s.original_order_id IS NULL
    AND (o.public_order_number = c.order_number OR o.tracking_number = c.tracking);

  RETURN jsonb_build_object(
    'orders_updated', v_by_number + v_by_tracking,
    'unmatched', GREATEST(v_total - (v_by_number + v_by_tracking), 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.courier_link_returns(p_trackings text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked int := 0;
  v_total int := 0;
BEGIN
  CREATE TEMP TABLE _picked AS
  SELECT r.tracking_number AS ret_tn, c.tracking_number AS orig_tn, c.original_order_id
  FROM public.courier_shipments r
  CROSS JOIN LATERAL (
    SELECT o.tracking_number, o.original_order_id
    FROM public.courier_shipments o
    WHERE o.is_return = false
      AND o.phone_normalized = r.phone_normalized
      AND (o.order_date IS NULL
           OR COALESCE(r.latest_status_date, r.order_date) IS NULL
           OR o.order_date <= COALESCE(r.latest_status_date, r.order_date))
    ORDER BY (COALESCE(o.comment_items::text, '') = COALESCE(r.comment_items::text, '')) DESC,
             o.order_date DESC NULLS LAST
    LIMIT 1
  ) c
  WHERE r.tracking_number = ANY(p_trackings)
    AND r.is_return = true
    AND r.phone_normalized IS NOT NULL;

  SELECT count(*) INTO v_total FROM public.courier_shipments
   WHERE tracking_number = ANY(p_trackings) AND is_return = true;

  UPDATE public.courier_shipments s
  SET linked_original_tracking_number = p.orig_tn,
      original_order_id = COALESCE(s.original_order_id, p.original_order_id)
  FROM _picked p
  WHERE s.tracking_number = p.ret_tn;

  UPDATE public.courier_shipments s
  SET linked_return_tracking_number = p.ret_tn
  FROM _picked p
  WHERE s.tracking_number = p.orig_tn;

  SELECT count(*) INTO v_linked FROM _picked;
  DROP TABLE _picked;

  RETURN jsonb_build_object('linked', v_linked, 'unlinked', GREATEST(v_total - v_linked, 0));
END;
$$;

REVOKE ALL ON FUNCTION public.courier_sync_orders(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.courier_link_returns(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.courier_sync_orders(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.courier_link_returns(text[]) TO service_role;