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
  raw_lines AS (
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
    WHERE nullif(trim(coalesce(el.val->>'code', '')), '') IS NOT NULL
  ),
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
    WHERE NOT EXISTS (SELECT 1 FROM raw_lines rl WHERE rl.shipment_id = sf.shipment_id)
  ),
  all_lines AS (
    SELECT * FROM raw_lines
    UNION ALL
    SELECT * FROM fallback_lines
  ),
  resolved AS (
    SELECT
      al.shipment_id,
      al.sale_date,
      al.payout_date,
      al.tracking_number,
      al.order_number,
      al.store,
      al.source,
      al.final_price,
      al.onway_fee,
      al.net_payout,
      al.line_idx,
      coalesce(prod.sku, al.raw_code) AS sku,
      coalesce(nullif(trim(prod.title), ''), 'Unknown SKU') AS title,
      al.qty,
      greatest(0::numeric, coalesce(prod.price, 0::numeric)) AS unit_price
    FROM all_lines al
    LEFT JOIN LATERAL (
      SELECT p.sku, p.title, p.price
      FROM public.products p
      WHERE lower(trim(p.sku)) = lower(trim(al.raw_code))
         OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(al.raw_code))
      ORDER BY (lower(trim(p.sku)) = lower(trim(al.raw_code))) DESC, p.created_at DESC
      LIMIT 1
    ) prod ON al.raw_code <> 'UNKNOWN'
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
      round((s.final_price * s.eff_weight / nullif(s.eff_total, 0))::numeric, 2) AS base_share,
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
        WHEN rd.rn = 1 THEN rd.base_share + (rd.final_price - sum(rd.base_share) OVER (PARTITION BY rd.shipment_id))
        ELSE rd.base_share
      END AS attributed_amount
    FROM rounded rd
  )
  SELECT * FROM finalized;
$$;

REVOKE ALL ON FUNCTION public._accountant_lines(date, date, text, text, text) FROM PUBLIC, anon, authenticated;
