CREATE OR REPLACE FUNCTION public.courier_label_daily_stats(p_store text DEFAULT NULL, p_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_day date := coalesce(p_day,(now() AT TIME ZONE 'Asia/Tbilisi')::date); v_result jsonb;
BEGIN
  IF NOT coalesce(public.is_active_staff(auth.uid()) OR public.is_active_admin(auth.uid()),false) THEN RAISE EXCEPTION 'Staff access required' USING ERRCODE='42501'; END IF;
  IF p_store IS NOT NULL AND p_store NOT IN ('A','B') THEN RAISE EXCEPTION 'Invalid store'; END IF;
  WITH applied AS (
    SELECT DISTINCT r.batch_id,r.matched_order_id AS order_id
    FROM public.import_staging_rows r JOIN public.import_batches b ON b.id=r.batch_id
    WHERE r.applied AND r.matched_order_id IS NOT NULL
      AND coalesce(r.applied_at,b.applied_at,b.created_at) >= v_day::timestamp AT TIME ZONE 'Asia/Tbilisi'
      AND coalesce(r.applied_at,b.applied_at,b.created_at) < (v_day+1)::timestamp AT TIME ZONE 'Asia/Tbilisi'
  ), scoped AS (
    SELECT a.* FROM applied a
    WHERE NOT public.is_test_order(a.order_id)
      AND (p_store IS NULL OR EXISTS (
        SELECT 1 FROM public.order_items i LEFT JOIN public.products p ON p.sku=i.sku
        WHERE i.order_id=a.order_id AND CASE WHEN upper(coalesce(p.warehouse,''))='A' THEN 'A' ELSE 'B' END=p_store
      ) OR (p_store='B' AND NOT EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id=a.order_id)))
  ), amounts AS (
    SELECT o.id,coalesce(o.total,0) AS gross,coalesce(o.total,0)-coalesce(o.shipping_fee,0) AS products_total,
      coalesce(o.shipping_fee,0) AS customer_delivery_fee
    FROM (SELECT DISTINCT order_id FROM scoped) a JOIN public.orders o ON o.id=a.order_id
  ) SELECT jsonb_build_object(
    'day',v_day,'batch_count',(SELECT count(DISTINCT batch_id) FROM scoped),
    'order_count',count(*),'total_with_fee',round(coalesce(sum(gross),0),2),
    'total_without_fee',round(coalesce(sum(products_total),0),2),
    'customer_delivery_fees',round(coalesce(sum(customer_delivery_fee),0),2),
    -- Compatibility for older open pages: never show pending courier charges.
    'known_net',round(coalesce(sum(products_total),0),2),'pending_fee_orders',0,
    'courier_fees',round(coalesce(sum(customer_delivery_fee),0),2)
  ) INTO v_result FROM amounts;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.courier_label_daily_stats(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_label_daily_stats(text,date) TO authenticated, service_role;