CREATE OR REPLACE FUNCTION public.accountant_by_sku(p_from date, p_to date, p_store text DEFAULT 'all', p_source text DEFAULT 'all', p_sku_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 v_rows jsonb;
 v_total_net numeric;
 v_total_units int;
 v_pending numeric;
 v_paid_failed numeric;
 v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
BEGIN
 IF NOT public.is_accountant_or_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
 END IF;
 WITH lines AS MATERIALIZED (
  SELECT * FROM public._accountant_lines(p_from,p_to,p_store,p_source,p_sku_search)
 ), agg AS (
  SELECT sku, max(title) AS title, sum(qty)::int AS units_sold,
   count(DISTINCT shipment_id)::int AS orders_count,
   round(sum(attributed_amount)::numeric,2) AS net_payout_attributed
  FROM lines GROUP BY sku
 )
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY net_payout_attributed DESC,units_sold DESC,sku ASC) FROM agg a),'[]'::jsonb),
  coalesce((SELECT round(sum(net_payout_attributed)::numeric,2) FROM agg),0),
  coalesce((SELECT sum(units_sold)::int FROM agg),0),
  coalesce((SELECT round(sum(attributed_amount)::numeric,2) FROM lines WHERE payout_date > v_today),0)
 INTO v_rows,v_total_net,v_total_units,v_pending;
 SELECT round(coalesce(sum(failed_fee) FILTER (WHERE payout_date <= v_today),0)::numeric,2)
 INTO v_paid_failed
 FROM public._accountant_failed_shipments(p_from,p_to,p_store,p_source,p_sku_search);
 RETURN jsonb_build_object('rows',v_rows,'total_units',v_total_units,
  'total_delivered_payout',v_total_net,'pending_delivered_payout',v_pending,
  'paid_failed_delivery_fees',v_paid_failed,
  'total_net_payout',round(v_total_net-v_pending-v_paid_failed,2));
END;
$$;