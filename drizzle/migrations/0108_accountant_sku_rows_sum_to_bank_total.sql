CREATE OR REPLACE FUNCTION public.accountant_by_sku(p_from date, p_to date, p_store text DEFAULT 'all', p_source text DEFAULT 'all', p_sku_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 v_rows jsonb;
 v_total_net numeric;
 v_total_units int;
 v_delivered numeric;
 v_failed numeric;
 v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
BEGIN
 IF NOT public.is_accountant_or_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
 END IF;
 WITH lines AS MATERIALIZED (
  SELECT l.sku, l.title, l.qty, l.shipment_id, l.attributed_amount
  FROM public._accountant_lines(p_from,p_to,p_store,p_source,p_sku_search) l
  WHERE l.payout_date <= v_today
 ), failed AS MATERIALIZED (
  SELECT f.shipment_id, f.failed_fee, cs.original_order_id, cs.sku AS cs_sku, cs.comment_items
  FROM public._accountant_failed_shipments(p_from,p_to,p_store,p_source,p_sku_search) f
  JOIN public.courier_shipments cs ON cs.id = f.shipment_id
  WHERE f.payout_date <= v_today
 ), failed_item_lines AS (
  SELECT fa.shipment_id, fa.failed_fee,
   coalesce(prod.sku, nullif(trim(oi.sku),''), 'UNKNOWN') AS sku,
   coalesce(nullif(trim(prod.title),''), nullif(trim(oi.title),''), 'Unknown SKU') AS title,
   greatest(1, coalesce(oi.quantity,1))::numeric AS qty
  FROM failed fa
  JOIN public.order_items oi ON oi.order_id = fa.original_order_id AND NOT coalesce(oi.is_gift,false)
  LEFT JOIN LATERAL (
   SELECT p.sku, p.title FROM public.products p
   WHERE (oi.product_id IS NOT NULL AND p.id = oi.product_id)
      OR (oi.product_id IS NULL AND nullif(trim(coalesce(oi.sku,'')),'') IS NOT NULL
          AND (lower(trim(p.sku)) = lower(trim(oi.sku)) OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(oi.sku))))
   ORDER BY (oi.product_id IS NOT NULL AND p.id = oi.product_id) DESC, p.created_at DESC
   LIMIT 1
  ) prod ON true
 ), failed_fallback_raw AS (
  SELECT fa.shipment_id, fa.failed_fee,
   coalesce(nullif(trim(fa.cs_sku),''),
    (SELECT nullif(trim(el->>'code'),'') FROM jsonb_array_elements(CASE WHEN jsonb_typeof(fa.comment_items)='array' THEN fa.comment_items ELSE '[]'::jsonb END) el
     WHERE nullif(trim(coalesce(el->>'code','')),'') IS NOT NULL LIMIT 1),
    'UNKNOWN') AS raw_code
  FROM failed fa
  WHERE NOT EXISTS (SELECT 1 FROM failed_item_lines fl WHERE fl.shipment_id = fa.shipment_id)
 ), failed_fallback_lines AS (
  SELECT fr.shipment_id, fr.failed_fee, coalesce(prod.sku, fr.raw_code) AS sku,
   coalesce(nullif(trim(prod.title),''), 'Unknown SKU') AS title, 1::numeric AS qty
  FROM failed_fallback_raw fr
  LEFT JOIN LATERAL (
   SELECT p.sku, p.title FROM public.products p
   WHERE lower(trim(p.sku)) = lower(trim(fr.raw_code))
      OR lower(trim(p.sku)) = 'g888-t4656-' || lower(trim(fr.raw_code))
   ORDER BY (lower(trim(p.sku)) = lower(trim(fr.raw_code))) DESC, p.created_at DESC
   LIMIT 1
  ) prod ON fr.raw_code <> 'UNKNOWN'
 ), failed_lines AS (
  SELECT x.sku, x.title, x.failed_fee * x.qty / sum(x.qty) OVER (PARTITION BY x.shipment_id) AS fee
  FROM (SELECT * FROM failed_item_lines UNION ALL SELECT * FROM failed_fallback_lines) x
 ), delivered_agg AS (
  SELECT sku, max(title) AS title, sum(qty)::int AS units_sold,
   count(DISTINCT shipment_id)::int AS orders_count, sum(attributed_amount) AS amount
  FROM lines GROUP BY sku
 ), failed_agg AS (
  SELECT sku, max(title) AS title, sum(fee) AS fee FROM failed_lines GROUP BY sku
 ), matched AS (
  SELECT f.sku, f.fee FROM failed_agg f JOIN delivered_agg d ON d.sku = f.sku
 ), orphan AS (
  SELECT coalesce((SELECT sum(fee) FROM failed_agg),0) - coalesce((SELECT sum(fee) FROM matched),0) AS fee
 ), base AS (
  SELECT d.sku, d.title, d.units_sold, d.orders_count,
   d.amount - coalesce(m.fee,0) AS net
  FROM delivered_agg d LEFT JOIN matched m ON m.sku = d.sku
 ), agg AS (
  SELECT b.sku, b.title, b.units_sold, b.orders_count,
   round((b.net - (SELECT fee FROM orphan) * CASE WHEN (SELECT sum(amount) FROM delivered_agg) > 0
     THEN (SELECT amount FROM delivered_agg x WHERE x.sku = b.sku) / (SELECT sum(amount) FROM delivered_agg) ELSE 0 END)::numeric, 2) AS net_payout_attributed
  FROM base b
 ), ranked AS (
  SELECT a.*, row_number() OVER (ORDER BY a.net_payout_attributed DESC, a.units_sold DESC, a.sku ASC) AS rn FROM agg a
 ), fixed AS (
  SELECT r.sku, r.title, r.units_sold, r.orders_count,
   r.net_payout_attributed + CASE WHEN r.rn = 1 THEN
     (round(coalesce((SELECT sum(attributed_amount) FROM lines),0)::numeric,2) - round(coalesce((SELECT sum(failed_fee) FROM failed),0)::numeric,2))
     - (SELECT sum(net_payout_attributed) FROM agg) ELSE 0 END AS net_payout_attributed, r.rn
  FROM ranked r
 )
 SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('sku',f.sku,'title',f.title,'units_sold',f.units_sold,'orders_count',f.orders_count,'net_payout_attributed',f.net_payout_attributed) ORDER BY f.rn) FROM fixed f),'[]'::jsonb),
  coalesce((SELECT round(sum(attributed_amount)::numeric,2) FROM lines),0),
  coalesce((SELECT round(sum(failed_fee)::numeric,2) FROM failed),0),
  coalesce((SELECT sum(units_sold)::int FROM agg),0)
 INTO v_rows, v_delivered, v_failed, v_total_units;
 v_total_net := round(v_delivered - v_failed, 2);
 RETURN jsonb_build_object('rows',v_rows,'total_units',v_total_units,
  'total_delivered_payout',v_total_net,'pending_delivered_payout',0,
  'paid_failed_delivery_fees',0,'total_net_payout',v_total_net);
END;
$$;
REVOKE ALL ON FUNCTION public.accountant_by_sku(date,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_by_sku(date,date,text,text,text) TO authenticated;