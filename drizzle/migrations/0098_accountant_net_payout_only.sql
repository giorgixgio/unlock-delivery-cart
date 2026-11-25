-- 1. Update internal _accountant_lines so attributed_amount splits net_payout (not final_price)
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

-- 2. Update accountant_summary: remove gross_collected / gross; compute avg_net_payout from net_payout
CREATE OR REPLACE FUNCTION public.accountant_summary(
  p_from date,
  p_to date,
  p_group_by text DEFAULT 'day',
  p_store text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_sku_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kpis jsonb;
  v_periods jsonb;
  v_group text := lower(coalesce(p_group_by, 'day'));
  v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
BEGIN
  IF NOT public.is_accountant_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH lines AS (
    SELECT * FROM public._accountant_lines(p_from, p_to, p_store, p_source, p_sku_search)
  ),
  shipments AS (
    SELECT
      shipment_id,
      sale_date,
      payout_date,
      onway_fee,
      net_payout,
      sum(qty)::int AS units
    FROM lines
    GROUP BY shipment_id, sale_date, payout_date, onway_fee, net_payout
  ),
  failed AS (
    SELECT * FROM public._accountant_failed_shipments(p_from, p_to, p_store, p_source, p_sku_search)
  ),
  deliv_grouped AS (
    SELECT
      CASE v_group
        WHEN 'week' THEN to_char(date_trunc('week', sale_date::timestamp)::date, 'YYYY-MM-DD')
        WHEN 'month' THEN to_char(date_trunc('month', sale_date::timestamp)::date, 'YYYY-MM')
        WHEN 'payout_date' THEN to_char(payout_date, 'YYYY-MM-DD')
        ELSE to_char(sale_date, 'YYYY-MM-DD')
      END AS period_key,
      CASE v_group
        WHEN 'week' THEN to_char(date_trunc('week', sale_date::timestamp)::date, 'YYYY-MM-DD')
          || ' .. ' || to_char((date_trunc('week', sale_date::timestamp)::date + 6), 'YYYY-MM-DD')
        WHEN 'month' THEN to_char(date_trunc('month', sale_date::timestamp)::date, 'YYYY-MM')
        WHEN 'payout_date' THEN to_char(payout_date, 'YYYY-MM-DD')
        ELSE to_char(sale_date, 'YYYY-MM-DD')
      END AS period_label,
      count(*)::int AS orders,
      coalesce(sum(units), 0)::int AS units,
      round(coalesce(sum(coalesce(onway_fee, 0)), 0)::numeric, 2) AS onway_fees,
      round(coalesce(sum(net_payout), 0)::numeric, 2) AS deliv_net
    FROM shipments
    GROUP BY 1, 2
  ),
  failed_grouped AS (
    SELECT
      CASE v_group
        WHEN 'week' THEN to_char(date_trunc('week', event_date::timestamp)::date, 'YYYY-MM-DD')
        WHEN 'month' THEN to_char(date_trunc('month', event_date::timestamp)::date, 'YYYY-MM')
        WHEN 'payout_date' THEN to_char(payout_date, 'YYYY-MM-DD')
        ELSE to_char(event_date, 'YYYY-MM-DD')
      END AS period_key,
      CASE v_group
        WHEN 'week' THEN to_char(date_trunc('week', event_date::timestamp)::date, 'YYYY-MM-DD')
          || ' .. ' || to_char((date_trunc('week', event_date::timestamp)::date + 6), 'YYYY-MM-DD')
        WHEN 'month' THEN to_char(date_trunc('month', event_date::timestamp)::date, 'YYYY-MM')
        WHEN 'payout_date' THEN to_char(payout_date, 'YYYY-MM-DD')
        ELSE to_char(event_date, 'YYYY-MM-DD')
      END AS period_label,
      count(*)::int AS failed_orders,
      round(coalesce(sum(failed_fee), 0)::numeric, 2) AS failed_fees
    FROM failed
    GROUP BY 1, 2
  ),
  combined AS (
    SELECT
      coalesce(d.period_key, f.period_key) AS period_key,
      coalesce(d.period_label, f.period_label) AS period_label,
      coalesce(d.orders, 0)::int AS orders,
      coalesce(d.units, 0)::int AS units,
      coalesce(d.onway_fees, 0)::numeric AS onway_fees,
      coalesce(f.failed_orders, 0)::int AS failed_orders,
      coalesce(f.failed_fees, 0)::numeric AS failed_fees,
      round((coalesce(d.deliv_net, 0) - coalesce(f.failed_fees, 0))::numeric, 2) AS net_payout,
      CASE
        WHEN v_group = 'payout_date' THEN (coalesce(d.period_key, f.period_key)::date > v_today)
        ELSE false
      END AS is_pending
    FROM deliv_grouped d
    FULL OUTER JOIN failed_grouped f ON f.period_key = d.period_key
    ORDER BY 1 ASC
  ),
  kpi_deliv AS (
    SELECT
      count(*)::int AS delivered_orders,
      coalesce(sum(units), 0)::int AS units_sold,
      round(coalesce(sum(coalesce(onway_fee, 0)), 0)::numeric, 2) AS onway_fees,
      round(coalesce(sum(net_payout) FILTER (WHERE payout_date <= v_today), 0)::numeric, 2) AS paid_deliv_net,
      round(coalesce(sum(net_payout) FILTER (WHERE payout_date > v_today), 0)::numeric, 2) AS pending_deliv_net,
      CASE WHEN count(*) > 0 THEN round((sum(net_payout) / count(*))::numeric, 2) ELSE 0 END AS avg_net_payout
    FROM shipments
  ),
  kpi_failed AS (
    SELECT
      count(*)::int AS failed_orders,
      round(coalesce(sum(failed_fee), 0)::numeric, 2) AS failed_delivery_fees,
      round(coalesce(sum(failed_fee) FILTER (WHERE payout_date <= v_today), 0)::numeric, 2) AS paid_failed_fees,
      round(coalesce(sum(failed_fee) FILTER (WHERE payout_date > v_today), 0)::numeric, 2) AS pending_failed_fees
    FROM failed
  )
  SELECT
    jsonb_build_object(
      'delivered_orders', kd.delivered_orders,
      'units_sold', kd.units_sold,
      'onway_fees', kd.onway_fees,
      'failed_orders', kf.failed_orders,
      'failed_delivery_fees', kf.failed_delivery_fees,
      'net_payout', round((kd.paid_deliv_net - kf.paid_failed_fees)::numeric, 2),
      'pending_payout', round((kd.pending_deliv_net - kf.pending_failed_fees)::numeric, 2),
      'avg_net_payout', kd.avg_net_payout
    ),
    coalesce(
      (SELECT jsonb_agg(to_jsonb(c) ORDER BY c.period_key ASC) FROM combined c),
      '[]'::jsonb
    )
  INTO v_kpis, v_periods
  FROM kpi_deliv kd, kpi_failed kf;

  RETURN jsonb_build_object('kpis', v_kpis, 'periods', v_periods);
END;
$$;

REVOKE ALL ON FUNCTION public.accountant_summary(date, date, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_summary(date, date, text, text, text, text) TO authenticated;

-- 3. Update accountant_sales: remove final_price from returned rows and sort options
CREATE OR REPLACE FUNCTION public.accountant_sales(
  p_from date,
  p_to date,
  p_store text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_sku_search text DEFAULT NULL,
  p_sort_by text DEFAULT 'sale_date',
  p_sort_dir text DEFAULT 'desc',
  p_page int DEFAULT 1,
  p_page_size int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total int;
  v_rows jsonb;
  v_limit int := greatest(1, least(coalesce(p_page_size, 50), 50000));
  v_offset int := greatest(0, (greatest(1, coalesce(p_page, 1)) - 1) * v_limit);
  v_sort text := lower(coalesce(p_sort_by, 'sale_date'));
  v_dir text := CASE WHEN lower(coalesce(p_sort_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
BEGIN
  IF NOT public.is_accountant_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH lines AS (
    SELECT * FROM public._accountant_lines(p_from, p_to, p_store, p_source, p_sku_search)
  ),
  shipments AS (
    SELECT
      shipment_id,
      sale_date,
      payout_date,
      tracking_number,
      order_number,
      store,
      source,
      string_agg(sku || ' ×' || qty::text, ', ' ORDER BY line_idx) AS skus_summary,
      string_agg(title, '; ' ORDER BY line_idx) AS titles_summary,
      sum(qty)::int AS units,
      onway_fee,
      net_payout
    FROM lines
    GROUP BY shipment_id, sale_date, payout_date, tracking_number, order_number, store, source, onway_fee, net_payout
  ),
  counted AS (
    SELECT count(*)::int AS cnt FROM shipments
  ),
  paged AS (
    SELECT *
    FROM shipments
    ORDER BY
      CASE WHEN v_sort = 'sale_date' AND v_dir = 'asc' THEN sale_date END ASC,
      CASE WHEN v_sort = 'sale_date' AND v_dir = 'desc' THEN sale_date END DESC,
      CASE WHEN v_sort = 'payout_date' AND v_dir = 'asc' THEN payout_date END ASC,
      CASE WHEN v_sort = 'payout_date' AND v_dir = 'desc' THEN payout_date END DESC,
      CASE WHEN v_sort = 'tracking_number' AND v_dir = 'asc' THEN tracking_number END ASC,
      CASE WHEN v_sort = 'tracking_number' AND v_dir = 'desc' THEN tracking_number END DESC,
      CASE WHEN v_sort = 'order_number' AND v_dir = 'asc' THEN order_number END ASC,
      CASE WHEN v_sort = 'order_number' AND v_dir = 'desc' THEN order_number END DESC,
      CASE WHEN v_sort = 'store' AND v_dir = 'asc' THEN store END ASC,
      CASE WHEN v_sort = 'store' AND v_dir = 'desc' THEN store END DESC,
      CASE WHEN v_sort = 'units' AND v_dir = 'asc' THEN units END ASC,
      CASE WHEN v_sort = 'units' AND v_dir = 'desc' THEN units END DESC,
      CASE WHEN v_sort = 'onway_fee' AND v_dir = 'asc' THEN coalesce(onway_fee, -1) END ASC,
      CASE WHEN v_sort = 'onway_fee' AND v_dir = 'desc' THEN coalesce(onway_fee, -1) END DESC,
      CASE WHEN v_sort = 'net_payout' AND v_dir = 'asc' THEN net_payout END ASC,
      CASE WHEN v_sort = 'net_payout' AND v_dir = 'desc' THEN net_payout END DESC,
      sale_date DESC,
      tracking_number DESC
    LIMIT v_limit OFFSET v_offset
  )
  SELECT
    (SELECT cnt FROM counted),
    coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM paged p), '[]'::jsonb)
  INTO v_total, v_rows;

  RETURN jsonb_build_object('total_count', v_total, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.accountant_sales(date, date, text, text, text, text, text, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_sales(date, date, text, text, text, text, text, int, int) TO authenticated;

-- 4. Update accountant_by_sku: return net_payout_attributed and total_net_payout
CREATE OR REPLACE FUNCTION public.accountant_by_sku(
  p_from date,
  p_to date,
  p_store text DEFAULT 'all',
  p_source text DEFAULT 'all',
  p_sku_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows jsonb;
  v_total_net numeric;
  v_total_units int;
BEGIN
  IF NOT public.is_accountant_or_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  WITH lines AS (
    SELECT * FROM public._accountant_lines(p_from, p_to, p_store, p_source, p_sku_search)
  ),
  agg AS (
    SELECT
      sku,
      max(title) AS title,
      sum(qty)::int AS units_sold,
      count(DISTINCT shipment_id)::int AS orders_count,
      round(sum(attributed_amount)::numeric, 2) AS net_payout_attributed
    FROM lines
    GROUP BY sku
    ORDER BY net_payout_attributed DESC, units_sold DESC, sku ASC
  )
  SELECT
    coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM agg a), '[]'::jsonb),
    coalesce((SELECT round(sum(net_payout_attributed)::numeric, 2) FROM agg), 0),
    coalesce((SELECT sum(units_sold)::int FROM agg), 0)
  INTO v_rows, v_total_net, v_total_units;

  RETURN jsonb_build_object(
    'rows', v_rows,
    'total_net_payout', v_total_net,
    'total_units', v_total_units
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accountant_by_sku(date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_by_sku(date, date, text, text, text) TO authenticated;