CREATE OR REPLACE FUNCTION public.accountant_by_sku(p_from date, p_to date, p_store text DEFAULT 'all', p_source text DEFAULT 'all', p_sku_search text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
 v_rows jsonb;
 v_total_net numeric;
 v_total_units int;
 v_today date := (now() AT TIME ZONE 'Asia/Tbilisi')::date;
BEGIN
 IF NOT public.is_accountant_or_admin(auth.uid()) THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
 END IF;
 WITH lines AS MATERIALIZED (
  SELECT * FROM public._accountant_lines(p_from,p_to,p_store,p_source,p_sku_search)
  WHERE payout_date <= v_today
 ), agg AS (
  SELECT sku, max(title) AS title, sum(qty)::int AS units_sold,
   count(DISTINCT shipment_id)::int AS orders_count,
   round(sum(attributed_amount)::numeric,2) AS net_payout_attributed
  FROM lines GROUP BY sku
 )
 SELECT coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY net_payout_attributed DESC,units_sold DESC,sku ASC) FROM agg a),'[]'::jsonb),
  coalesce((SELECT round(sum(net_payout_attributed)::numeric,2) FROM agg),0),
  coalesce((SELECT sum(units_sold)::int FROM agg),0)
 INTO v_rows,v_total_net,v_total_units;
 RETURN jsonb_build_object('rows',v_rows,'total_units',v_total_units,
  'total_delivered_payout',v_total_net,'pending_delivered_payout',0,
  'paid_failed_delivery_fees',0,'total_net_payout',v_total_net);
END;
$$;
REVOKE ALL ON FUNCTION public.accountant_by_sku(date,date,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accountant_by_sku(date,date,text,text,text) TO authenticated;