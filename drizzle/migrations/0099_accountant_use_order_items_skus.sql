-- 1. Update _accountant_lines to resolve products from linked order_items first,
--    falling back to comment_items / shipment sku only for unlinked shipments.
CREATE OR REPLACE FUNCTION public._accountant_lines(
  p_from date,
  p_to date,
  p_store text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_sku_search text DEFAULT NULL
)
RETURNS TABLE (
  shipment_id uuid,
  sale_date date,
  payout_date date,
  tracking_number text,
  order_number text,
  store text,
  source text,
  final_price numeric,
  onway_fee numeric,
  net_payout numeric,
  line_idx int,
  sku text,
  title text,
  qty int,
  attributed_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base_shipments AS (
    SELECT
      cs.id AS shipment_id,
      cs.original_order_id,
      (cs.final_status_date AT TIME ZONE 'Asia/Tbilisi')::date AS sale_date,
      public.onway_expected_payout_date((cs.final_status_date AT TIME ZONE 'Asia/Tbilisi')::date) AS payout_date,
      cs.tracking_number,
      coalesce(nullif(trim(cs.order_number), ''), o.public_order_number, '') AS order_number,
      CASE
        WHEN lower(coalesce(cs.sender_name, '')) LIKE '%ტრენდმარტ%'
          OR lower(coalesce(cs.sender_name, '')) LIKE '%trendmart%' THEN 'TrendMart'
        WHEN lower(coalesce(cs.sender_name, '')) LIKE '%ბიგმარტ%'
          OR lower(coalesce(cs.sender_name, '')) LIKE '%bigmart%' THEN 'BigMart'
        WHEN cs.original_order_id IS NOT NULL THEN COALESCE(
          (
            SELECT CASE WHEN p.warehouse = 'A' THEN 'BigMart' ELSE 'TrendMart' END
            FROM public.order_items oi
            LEFT JOIN public.products p
              ON p.id = oi.product_id OR lower(trim(p.sku)) = lower(trim(oi.sku))
            WHERE oi.order_id = cs.original_order_id
            LIMIT 1
          ),
          'Unknown'
        )
        ELSE 'Unknown'
      END AS store,
      cs.source,
      round(coalesce(cs.cod_amount, 0)::numeric, 2) AS final_price,
      CASE
        WHEN cs.source = 'api' THEN
          round(
            (
              coalesce(cs.onway_shipping_price, 0)
              + coalesce(cs.onway_extra_services_price, 0)
              + round((coalesce(cs.cod_amount, 0) * 0.02)::numeric, 2)
            )::numeric,
            2
          )
        WHEN cs.onway_shipping_price IS NOT NULL OR cs.onway_extra_services_price IS NOT NULL THEN
          round((coalesce(cs.onway_shipping_price, 0) + coalesce(cs.onway_extra_services_price, 0))::numeric, 2)
        ELSE NULL
      END AS onway_fee,
      CASE
        WHEN cs.source = 'api' THEN
          round(
            (
              coalesce(cs.company_receives, 0)
              - round((coalesce(cs.cod_amount, 0) * 0.02)::numeric, 2)
            )::numeric,
            2
          )
        ELSE round(coalesce(cs.company_receives, 0)::numeric, 2)
      END AS net_payout,
      cs.comment_items,
      cs.sku AS fallback_sku,
      cs.quantity AS fallback_qty
    FROM public.courier_shipments cs
    LEFT JOIN public.orders o ON o.id = cs.original_order_id
    WHERE cs.derived_state = 'DELIVERED'
      AND cs.is_return = false
      AND cs.final_status_date IS NOT NULL
      AND cs.final_status_date >= (p_from::timestamp AT TIME ZONE 'Asia/Tbilisi')
      AND cs.final_status_date < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Tbilisi')
      AND (p_source IS NULL OR lower(p_source) = 'all' OR lower(cs.source) = lower(p_source))
      AND NOT (cs.original_order_id IS NOT NULL AND public.is_test_order(cs.original_order_id))
      AND NOT (cs.sku IS NOT NULL AND public.is_test_sku(cs.sku))
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cs.comment_items) = 'array' THEN cs.comment_items ELSE '[]'::jsonb END
        ) it
        WHERE public.is_test_sku(it->>'code')
           OR public.is_test_sku('G888-T4656-' || coalesce(it->>'code', ''))
      )
  ),
  store_filtered AS (
    SELECT *
    FROM base_shipments
    WHERE p_store IS NULL OR lower(p_store) = 'all' OR lower(store) = lower(p_store)
  ),
  -- Primary source: linked order_items (prefer non-gift lines when any paid line exists)
  order_item_candidates AS (
    SELECT
      sf.shipment_id,
      sf.sale_date,
      sf.payout_date,
      sf.tracking_number,
      sf.order_number,
      sf.store,
      sf.source,
      sf.final_price,
      sf.onway_fee,
      sf.net_payout,
      oi.product_id,
      oi.sku AS oi_sku,
      oi.title AS oi_title,
      greatest(1, coalesce(oi.quantity, 1))::int AS qty,
      coalesce(oi.is_gift, false) AS is_gift,
      coalesce(oi.unit_price, 0)::numeric AS oi_unit_price,
      bool_or(NOT coalesce(oi.is_gift, false)) OVER (PARTITION BY sf.shipment_id) AS has_paid_items,
      row_number() OVER (PARTITION BY sf.shipment_id ORDER BY coalesce(oi.is_gift, false) ASC, oi.id ASC)::int AS line_idx
    FROM store_filtered sf
    JOIN public.order_items oi ON oi.order_id = sf.original_order_id
    WHERE sf.original_order_id IS NOT NULL
  ),
  order_lines_resolved AS (
    SELECT
      oic.shipment_id,
      oic.sale_date,
      oic.payout_date,
      oic.tracking_number,
      oic.order_number,
      oic.store,
      oic.source,
      oic.final_price,
      oic.onway_fee,
      oic.net_payout,
      oic.line_idx,
      coalesce(prod.sku, nullif(trim(oic.oi_sku), ''), 'UNKNOWN') AS sku,
      coalesce(nullif(trim(prod.title), ''), nullif(trim(oic.oi_title), ''), 'Unknown SKU') AS title,
      oic.qty,
      CASE
        WHEN oic.is_gift THEN 0::numeric
        ELSE greatest(0::numeric, coalesce(nullif(oic.oi_unit_price, 0), prod.price, 0::numeric))
      END AS unit_price
    FROM order_item_candidates oic
    LEFT JOIN LATERAL (
      SELECT p.sku, p.title, p.price
      FROM public.products p
      WHERE (oic.product_id IS NOT NULL AND p.id = oic.product_id)
         OR (
           oic.product_id IS NULL
           AND nullif(trim(coalesce(oic.oi_sku, '')), '') IS NOT NULL
           AND (
             lower(trim(p.sku)) = lower(trim(oic.oi_sku))
             OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(oic.oi_sku))
           )
         )
      ORDER BY (oic.product_id IS NOT NULL AND p.id = oic.product_id) DESC, p.created_at DESC
      LIMIT 1
    ) prod ON true
    WHERE (NOT oic.has_paid_items) OR (NOT oic.is_gift)
  ),
  -- Fallback 1: comment_items for shipments with NO linked order_items
  raw_comment_lines AS (
    SELECT
      sf.shipment_id,
      sf.sale_date,
      sf.payout_date,
      sf.tracking_number,
      sf.order_number,
      sf.store,
      sf.source,
      sf.final_price,
      sf.onway_fee,
      sf.net_payout,
      el.ord::int AS line_idx,
      trim(el.val->>'code') AS raw_code,
      greatest(
        1,
        coalesce(
          nullif(regexp_replace(coalesce(el.val->>'qty', '1'), '[^0-9]', '', 'g'), '')::int,
          1
        )
      ) AS qty
    FROM store_filtered sf
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE WHEN jsonb_typeof(sf.comment_items) = 'array' THEN sf.comment_items ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS el(val, ord)
    WHERE NOT EXISTS (SELECT 1 FROM order_lines_resolved ol WHERE ol.shipment_id = sf.shipment_id)
      AND nullif(trim(coalesce(el.val->>'code', '')), '') IS NOT NULL
      AND lower(trim(el.val->>'code')) NOT IN (
        'exact_sku_match',
        'low_confidence_address',
        'address_too_short',
        'sku_overlap',
        'same_cookie',
        'same_phone',
        'same_address',
        'rapid_reorder'
      )
  ),
  -- Fallback 2: courier_shipments.sku or UNKNOWN when neither order_items nor comment_items matched
  fallback_lines AS (
    SELECT
      sf.shipment_id,
      sf.sale_date,
      sf.payout_date,
      sf.tracking_number,
      sf.order_number,
      sf.store,
      sf.source,
      sf.final_price,
      sf.onway_fee,
      sf.net_payout,
      1 AS line_idx,
      coalesce(nullif(trim(sf.fallback_sku), ''), 'UNKNOWN') AS raw_code,
      greatest(1, coalesce(sf.fallback_qty, 1)) AS qty
    FROM store_filtered sf
    WHERE NOT EXISTS (SELECT 1 FROM order_lines_resolved ol WHERE ol.shipment_id = sf.shipment_id)
      AND NOT EXISTS (SELECT 1 FROM raw_comment_lines rl WHERE rl.shipment_id = sf.shipment_id)
  ),
  unlinked_lines AS (
    SELECT * FROM raw_comment_lines
    UNION ALL
    SELECT * FROM fallback_lines
  ),
  unlinked_resolved AS (
    SELECT
      ul.shipment_id,
      ul.sale_date,
      ul.payout_date,
      ul.tracking_number,
      ul.order_number,
      ul.store,
      ul.source,
      ul.final_price,
      ul.onway_fee,
      ul.net_payout,
      ul.line_idx,
      coalesce(prod.sku, ul.raw_code) AS sku,
      coalesce(nullif(trim(prod.title), ''), 'Unknown SKU') AS title,
      ul.qty,
      greatest(0::numeric, coalesce(prod.price, 0::numeric)) AS unit_price
    FROM unlinked_lines ul
    LEFT JOIN LATERAL (
      SELECT p.sku, p.title, p.price
      FROM public.products p
      WHERE lower(trim(p.sku)) = lower(trim(ul.raw_code))
         OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(ul.raw_code))
         OR lower(trim(p.sku)) = 'g888-t4656-' || regexp_replace(lower(trim(ul.raw_code)), '_[0-9]+$', '')
      ORDER BY (lower(trim(p.sku)) = lower(trim(ul.raw_code))) DESC,
               (lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(ul.raw_code))) DESC,
               p.created_at DESC
      LIMIT 1
    ) prod ON ul.raw_code <> 'UNKNOWN'
  ),
  resolved AS (
    SELECT * FROM order_lines_resolved
    UNION ALL
    SELECT * FROM unlinked_resolved
  ),
  sku_filtered_shipments AS (
    SELECT DISTINCT r.shipment_id
    FROM resolved r
    WHERE nullif(trim(coalesce(p_sku_search, '')), '') IS NULL
       OR r.sku ILIKE '%' || trim(p_sku_search) || '%'
       OR r.title ILIKE '%' || trim(p_sku_search) || '%'
  ),
  weighted AS (
    SELECT
      r.*,
      sum(r.unit_price * r.qty) OVER (PARTITION BY r.shipment_id) AS price_weight_sum,
      sum(r.qty::numeric) OVER (PARTITION BY r.shipment_id) AS qty_weight_sum
    FROM resolved r
    JOIN sku_filtered_shipments sfs ON sfs.shipment_id = r.shipment_id
  ),
  shares AS (
    SELECT
      w.*,
      CASE
        WHEN w.price_weight_sum > 0 THEN (w.unit_price * w.qty)
        ELSE w.qty::numeric
      END AS eff_weight,
      CASE
        WHEN w.price_weight_sum > 0 THEN w.price_weight_sum
        ELSE w.qty_weight_sum
      END AS eff_total
    FROM weighted w
  ),
  rounded AS (
    SELECT
      s.*,
      round((s.net_payout * s.eff_weight / nullif(s.eff_total, 0))::numeric, 2) AS base_share,
      row_number() OVER (PARTITION BY s.shipment_id ORDER BY s.eff_weight DESC, s.line_idx ASC) AS rn
    FROM shares s
  ),
  finalized AS (
    SELECT
      rd.shipment_id,
      rd.sale_date,
      rd.payout_date,
      rd.tracking_number,
      rd.order_number,
      rd.store,
      rd.source,
      rd.final_price,
      rd.onway_fee,
      rd.net_payout,
      rd.line_idx,
      rd.sku,
      rd.title,
      rd.qty,
      CASE
        WHEN rd.rn = 1 THEN rd.base_share + (rd.net_payout - sum(rd.base_share) OVER (PARTITION BY rd.shipment_id))
        ELSE rd.base_share
      END AS attributed_amount
    FROM rounded rd
  )
  SELECT * FROM finalized;
$$;

REVOKE ALL ON FUNCTION public._accountant_lines(date, date, text, text, text) FROM PUBLIC, anon, authenticated;

-- 2. Update _accountant_failed_shipments so SKU search also matches linked order_items
CREATE OR REPLACE FUNCTION public._accountant_failed_shipments(
  p_from date,
  p_to date,
  p_store text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_sku_search text DEFAULT NULL
)
RETURNS TABLE (
  shipment_id uuid,
  event_date date,
  payout_date date,
  store text,
  source text,
  failed_fee numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH base_failed AS (
    SELECT
      cs.id AS shipment_id,
      cs.original_order_id,
      (coalesce(cs.final_status_date, cs.latest_status_date) AT TIME ZONE 'Asia/Tbilisi')::date AS event_date,
      public.onway_expected_payout_date((coalesce(cs.final_status_date, cs.latest_status_date) AT TIME ZONE 'Asia/Tbilisi')::date) AS payout_date,
      CASE
        WHEN lower(coalesce(cs.sender_name, '')) LIKE '%ტრენდმარტ%'
          OR lower(coalesce(cs.sender_name, '')) LIKE '%trendmart%' THEN 'TrendMart'
        WHEN lower(coalesce(cs.sender_name, '')) LIKE '%ბიგმარტ%'
          OR lower(coalesce(cs.sender_name, '')) LIKE '%bigmart%' THEN 'BigMart'
        WHEN cs.original_order_id IS NOT NULL THEN COALESCE(
          (
            SELECT CASE WHEN p.warehouse = 'A' THEN 'BigMart' ELSE 'TrendMart' END
            FROM public.order_items oi
            LEFT JOIN public.products p
              ON p.id = oi.product_id OR lower(trim(p.sku)) = lower(trim(oi.sku))
            WHERE oi.order_id = cs.original_order_id
            LIMIT 1
          ),
          'Unknown'
        )
        ELSE 'Unknown'
      END AS store,
      cs.source,
      round((coalesce(cs.onway_shipping_price, 0) + coalesce(cs.onway_extra_services_price, 0))::numeric, 2) AS failed_fee,
      cs.comment_items,
      cs.sku AS fallback_sku
    FROM public.courier_shipments cs
    WHERE cs.derived_state = 'FAILED_FINAL'
      AND cs.is_return = false
      AND coalesce(cs.final_status_date, cs.latest_status_date) IS NOT NULL
      AND coalesce(cs.final_status_date, cs.latest_status_date) >= (p_from::timestamp AT TIME ZONE 'Asia/Tbilisi')
      AND coalesce(cs.final_status_date, cs.latest_status_date) < ((p_to + 1)::timestamp AT TIME ZONE 'Asia/Tbilisi')
      AND (p_source IS NULL OR lower(p_source) = 'all' OR lower(cs.source) = lower(p_source))
      AND NOT (cs.original_order_id IS NOT NULL AND public.is_test_order(cs.original_order_id))
      AND NOT (cs.sku IS NOT NULL AND public.is_test_sku(cs.sku))
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(cs.comment_items) = 'array' THEN cs.comment_items ELSE '[]'::jsonb END
        ) it
        WHERE public.is_test_sku(it->>'code')
           OR public.is_test_sku('G888-T4656-' || coalesce(it->>'code', ''))
      )
  ),
  store_filtered AS (
    SELECT *
    FROM base_failed
    WHERE p_store IS NULL OR lower(p_store) = 'all' OR lower(store) = lower(p_store)
  )
  SELECT
    sf.shipment_id,
    sf.event_date,
    sf.payout_date,
    sf.store,
    sf.source,
    sf.failed_fee
  FROM store_filtered sf
  WHERE nullif(trim(coalesce(p_sku_search, '')), '') IS NULL
     OR sf.fallback_sku ILIKE '%' || trim(p_sku_search) || '%'
     OR (
       sf.original_order_id IS NOT NULL
       AND EXISTS (
         SELECT 1
         FROM public.order_items oi
         LEFT JOIN public.products p ON p.id = oi.product_id
         WHERE oi.order_id = sf.original_order_id
           AND (
             coalesce(oi.sku, '') ILIKE '%' || trim(p_sku_search) || '%'
             OR coalesce(oi.title, '') ILIKE '%' || trim(p_sku_search) || '%'
             OR coalesce(p.sku, '') ILIKE '%' || trim(p_sku_search) || '%'
             OR coalesce(p.title, '') ILIKE '%' || trim(p_sku_search) || '%'
           )
       )
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(sf.comment_items) = 'array' THEN sf.comment_items ELSE '[]'::jsonb END
       ) el
       LEFT JOIN public.products p
         ON lower(trim(p.sku)) = lower(trim(coalesce(el->>'code', '')))
         OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(coalesce(el->>'code', '')))
       WHERE coalesce(el->>'code', '') ILIKE '%' || trim(p_sku_search) || '%'
          OR coalesce(p.sku, '') ILIKE '%' || trim(p_sku_search) || '%'
          OR coalesce(p.title, '') ILIKE '%' || trim(p_sku_search) || '%'
     );
$$;

REVOKE ALL ON FUNCTION public._accountant_failed_shipments(date, date, text, text, text) FROM PUBLIC, anon, authenticated;