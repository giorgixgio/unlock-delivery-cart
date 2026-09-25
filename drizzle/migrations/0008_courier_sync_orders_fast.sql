CREATE OR REPLACE FUNCTION public.courier_sync_orders(p_batch_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '120s'
AS $function$
DECLARE
  v_by_number int := 0;
  v_by_normalized int := 0;
  v_by_tracking int := 0;
  v_total int := 0;
BEGIN
  DROP TABLE IF EXISTS _cr;
  DROP TABLE IF EXISTS _ord;
  CREATE TEMP TABLE _cr ON COMMIT DROP AS
  SELECT r.tracking, nullif(btrim(r.order_number), '') AS order_number, r.status,
         nullif(regexp_replace(coalesce(r.order_number, ''), '[^0-9]', '', 'g'), '') AS num_digits,
         nullif(s.phone_normalized, '') AS phone
  FROM jsonb_to_recordset(p_rows) AS r(tracking text, order_number text, status text)
  LEFT JOIN public.courier_shipments s ON s.tracking_number = r.tracking;
  UPDATE _cr SET phone = NULL WHERE phone = '555555555';
  CREATE INDEX ON _cr(tracking);
  CREATE INDEX ON _cr(order_number);
  CREATE INDEX ON _cr(num_digits);
  ANALYZE _cr;

  -- normalized snapshot of orders, computed once
  CREATE TEMP TABLE _ord ON COMMIT DROP AS
  SELECT o.id, o.public_order_number AS pon,
         nullif(regexp_replace(coalesce(o.public_order_number, ''), '[^0-9]', '', 'g'), '') AS num_digits,
         nullif(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), '') AS phone,
         o.tracking_number
  FROM public.orders o
  WHERE regexp_replace(coalesce(o.public_order_number, ''), '[^0-9]', '', 'g') IN (SELECT num_digits FROM _cr WHERE num_digits IS NOT NULL)
     OR o.tracking_number IN (SELECT tracking FROM _cr);
  CREATE INDEX ON _ord(pon);
  CREATE INDEX ON _ord(num_digits, phone);
  CREATE INDEX ON _ord(tracking_number);
  ANALYZE _ord;

  SELECT count(*) INTO v_total FROM _cr;

  -- 1) exact order number
  WITH upd AS (
    UPDATE public.orders o
    SET courier_status = c.status, courier_import_batch_id = p_batch_id,
        tracking_number = COALESCE(o.tracking_number, c.tracking)
    FROM _cr c
    WHERE c.order_number IS NOT NULL AND o.public_order_number = c.order_number
    RETURNING 1
  ) SELECT count(*) INTO v_by_number FROM upd;

  -- 2) normalized number + phone, unique
  WITH unique_matches AS (
    SELECT c.tracking, c.status, min(x.id::text)::uuid AS order_id
    FROM _cr c
    JOIN _ord x ON x.num_digits = c.num_digits AND x.phone = c.phone
    WHERE c.order_number IS NOT NULL AND c.phone IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM _ord y WHERE y.pon = c.order_number)
    GROUP BY c.tracking, c.status
    HAVING count(*) = 1
  ), upd AS (
    UPDATE public.orders o
    SET courier_status = m.status, courier_import_batch_id = p_batch_id,
        tracking_number = COALESCE(o.tracking_number, m.tracking)
    FROM unique_matches m WHERE o.id = m.order_id
    RETURNING 1
  ) SELECT count(*) INTO v_by_normalized FROM upd;

  -- 3) by tracking when number doesn't resolve
  WITH upd AS (
    UPDATE public.orders o
    SET courier_status = c.status, courier_import_batch_id = p_batch_id
    FROM _cr c
    WHERE o.tracking_number = c.tracking
      AND (c.order_number IS NULL OR NOT EXISTS (
        SELECT 1 FROM _ord o2 WHERE o2.pon = c.order_number OR o2.num_digits = c.num_digits))
    RETURNING 1
  ) SELECT count(*) INTO v_by_tracking FROM upd;

  -- link shipments to orders (split OR into separate indexed passes)
  UPDATE public.courier_shipments s SET original_order_id = x.id
  FROM _cr c JOIN _ord x ON x.pon = c.order_number
  WHERE s.tracking_number = c.tracking AND s.original_order_id IS NULL;

  UPDATE public.courier_shipments s SET original_order_id = x.id
  FROM _cr c JOIN _ord x ON x.tracking_number = c.tracking
  WHERE s.tracking_number = c.tracking AND s.original_order_id IS NULL;

  UPDATE public.courier_shipments s SET original_order_id = m.id
  FROM (
    SELECT c.tracking, min(x.id::text)::uuid AS id
    FROM _cr c JOIN _ord x ON x.num_digits = c.num_digits AND x.phone = c.phone
    WHERE c.order_number IS NOT NULL AND c.phone IS NOT NULL
    GROUP BY c.tracking HAVING count(*) = 1
  ) m
  WHERE s.tracking_number = m.tracking AND s.original_order_id IS NULL;

  RETURN jsonb_build_object(
    'orders_updated', v_by_number + v_by_normalized + v_by_tracking,
    'matched_normalized', v_by_normalized,
    'unmatched', GREATEST(v_total - (v_by_number + v_by_normalized + v_by_tracking), 0)
  );
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_orders_public_order_number ON public.orders(public_order_number);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_number ON public.orders(tracking_number);
CREATE INDEX IF NOT EXISTS idx_courier_shipments_tracking ON public.courier_shipments(tracking_number);