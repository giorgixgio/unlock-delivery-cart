CREATE OR REPLACE FUNCTION public.courier_sync_orders(p_batch_id uuid, p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_by_number int := 0;
  v_by_normalized int := 0;
  v_by_tracking int := 0;
  v_total int := 0;
BEGIN
  CREATE TEMP TABLE _cr(tracking text, order_number text, status text) ON COMMIT DROP;
  INSERT INTO _cr
  SELECT r.tracking, nullif(btrim(r.order_number), ''), r.status
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

  WITH unique_matches AS (
    SELECT c.tracking, c.status, min(o.id::text)::uuid AS order_id
    FROM _cr c
    JOIN public.courier_shipments s ON s.tracking_number = c.tracking
    JOIN public.orders o
      ON regexp_replace(coalesce(o.public_order_number, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(c.order_number, ''), '[^0-9]', '', 'g')
     AND regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') = s.phone_normalized
    WHERE c.order_number IS NOT NULL
      AND s.phone_normalized IS NOT NULL
      AND s.phone_normalized <> ''
      AND s.phone_normalized <> '555555555'
      AND NOT EXISTS (SELECT 1 FROM public.orders x WHERE x.public_order_number = c.order_number)
    GROUP BY c.tracking, c.status
    HAVING count(*) = 1
  ), upd AS (
    UPDATE public.orders o
    SET courier_status = m.status,
        courier_import_batch_id = p_batch_id,
        tracking_number = COALESCE(o.tracking_number, m.tracking)
    FROM unique_matches m
    WHERE o.id = m.order_id
    RETURNING 1
  )
  SELECT count(*) INTO v_by_normalized FROM upd;

  WITH upd AS (
    UPDATE public.orders o
    SET courier_status = c.status,
        courier_import_batch_id = p_batch_id
    FROM _cr c
    WHERE o.tracking_number = c.tracking
      AND (c.order_number IS NULL
           OR NOT EXISTS (
             SELECT 1 FROM public.orders o2
             WHERE o2.public_order_number = c.order_number
                OR regexp_replace(coalesce(o2.public_order_number, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(c.order_number, ''), '[^0-9]', '', 'g')
           ))
    RETURNING 1
  )
  SELECT count(*) INTO v_by_tracking FROM upd;

  UPDATE public.courier_shipments s
  SET original_order_id = o.id
  FROM public.orders o, _cr c
  WHERE s.tracking_number = c.tracking
    AND s.original_order_id IS NULL
    AND (
      o.public_order_number = c.order_number
      OR o.tracking_number = c.tracking
      OR (
        c.order_number IS NOT NULL
        AND s.phone_normalized IS NOT NULL
        AND s.phone_normalized <> ''
        AND s.phone_normalized <> '555555555'
        AND regexp_replace(coalesce(o.public_order_number, ''), '[^0-9]', '', 'g') = regexp_replace(c.order_number, '[^0-9]', '', 'g')
        AND regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') = s.phone_normalized
        AND 1 = (
          SELECT count(*)
          FROM public.orders ox
          WHERE regexp_replace(coalesce(ox.public_order_number, ''), '[^0-9]', '', 'g') = regexp_replace(c.order_number, '[^0-9]', '', 'g')
            AND regexp_replace(coalesce(ox.customer_phone, ''), '[^0-9]', '', 'g') = s.phone_normalized
        )
      )
    );

  RETURN jsonb_build_object(
    'orders_updated', v_by_number + v_by_normalized + v_by_tracking,
    'matched_normalized', v_by_normalized,
    'unmatched', GREATEST(v_total - (v_by_number + v_by_normalized + v_by_tracking), 0)
  );
END;
$function$;

WITH candidates AS (
  SELECT cs.id AS shipment_id, min(o.id::text)::uuid AS order_id
  FROM public.courier_shipments cs
  JOIN public.orders o
    ON regexp_replace(coalesce(o.public_order_number, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(cs.order_number, ''), '[^0-9]', '', 'g')
   AND regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g') = cs.phone_normalized
  WHERE cs.is_return = false
    AND cs.original_order_id IS NULL
    AND cs.order_number IS NOT NULL
    AND cs.phone_normalized IS NOT NULL
    AND cs.phone_normalized <> ''
    AND cs.phone_normalized <> '555555555'
  GROUP BY cs.id
  HAVING count(*) = 1
)
UPDATE public.courier_shipments cs
SET original_order_id = c.order_id
FROM candidates c
WHERE cs.id = c.shipment_id;