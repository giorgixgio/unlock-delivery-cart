-- Internal helper for failed-delivery Onway fees (not directly callable by clients)
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

-- Update accountant_summary to include failed_delivery_fees, paid-out net_payout, and pending_payout
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
      final_price,
      onway_fee,
      net_payout,
      sum(qty)::int AS units
    FROM lines
    GROUP BY shipment_id, sale_date, payout_date, final_price, onway_fee, net_payout
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
      round(coalesce(sum(final_price), 0)::numeric, 2) AS gross,
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
      coalesce(d.gross, 0)::numeric AS gross,
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
      round(coalesce(sum(final_price), 0)::numeric, 2) AS gross_collected,
      round(coalesce(sum(coalesce(onway_fee, 0)), 0)::numeric, 2) AS onway_fees,
      round(coalesce(sum(net_payout) FILTER (WHERE payout_date <= v_today), 0)::numeric, 2) AS paid_deliv_net,
      round(coalesce(sum(net_payout) FILTER (WHERE payout_date > v_today), 0)::numeric, 2) AS pending_deliv_net,
      CASE WHEN count(*) > 0 THEN round((sum(final_price) / count(*))::numeric, 2) ELSE 0 END AS avg_order_value
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
      'gross_collected', kd.gross_collected,
      'onway_fees', kd.onway_fees,
      'failed_orders', kf.failed_orders,
      'failed_delivery_fees', kf.failed_delivery_fees,
      'net_payout', round((kd.paid_deliv_net - kf.paid_failed_fees)::numeric, 2),
      'pending_payout', round((kd.pending_deliv_net - kf.pending_failed_fees)::numeric, 2),
      'avg_order_value', kd.avg_order_value
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
