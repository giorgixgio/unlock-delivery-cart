ALTER TABLE public.courier_label_actions ADD COLUMN IF NOT EXISTS warehouse text CHECK (warehouse IN ('A','B'));

CREATE OR REPLACE FUNCTION public.courier_label_auto_finish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_scope text; v_store text; v_prior record;
BEGIN
  IF NEW.kind NOT IN ('pdf','tags') OR strpos(NEW.group_key,'::') = 0 THEN RETURN NEW; END IF;
  v_scope := split_part(NEW.group_key,'::',1);
  IF split_part(NEW.group_key,'::',2) IN ('_opened','_archived') THEN RETURN NEW; END IF;
  SELECT coalesce(NEW.warehouse,b.store) INTO v_store FROM (SELECT 1) x LEFT JOIN public.import_batches b ON b.id::text=v_scope;
  PERFORM pg_advisory_xact_lock(hashtextextended('courier-label-start:' || coalesce(v_store,v_scope),0));
  -- Second print action or a reprint is not the start of another batch.
  IF EXISTS (SELECT 1 FROM public.courier_label_actions a WHERE a.group_key=NEW.group_key AND a.kind IN ('pdf','tags','finish')) THEN RETURN NEW; END IF;
  FOR v_prior IN
    SELECT a.group_key, max(a.title) AS title
    FROM public.courier_label_actions a
    LEFT JOIN public.import_batches b ON b.id::text=split_part(a.group_key,'::',1)
    WHERE a.kind IN ('pdf','tags') AND a.group_key<>NEW.group_key
      AND split_part(a.group_key,'::',2) NOT IN ('_opened','_archived')
      AND ((v_store IS NOT NULL AND coalesce(a.warehouse,b.store)=v_store)
        OR (v_store IS NULL AND split_part(a.group_key,'::',1)=v_scope))
      AND NOT EXISTS (SELECT 1 FROM public.courier_label_actions f WHERE f.group_key=a.group_key AND f.kind='finish')
      AND NOT EXISTS (SELECT 1 FROM public.courier_label_actions ar WHERE ar.group_key=split_part(a.group_key,'::',1)||'::_archived')
    GROUP BY a.group_key
  LOOP
    INSERT INTO public.courier_label_actions(group_key,title,kind,actor,warehouse,created_at)
    VALUES(v_prior.group_key,v_prior.title,'finish',NEW.actor,v_store,NEW.created_at - interval '1 microsecond');
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.courier_label_auto_finish() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER courier_label_auto_finish_before_start BEFORE INSERT ON public.courier_label_actions FOR EACH ROW EXECUTE FUNCTION public.courier_label_auto_finish();

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
    SELECT o.id,coalesce(s.gross,o.total,0) AS gross,s.net,s.known
    FROM (SELECT DISTINCT order_id FROM scoped) a JOIN public.orders o ON o.id=a.order_id
    LEFT JOIN LATERAL (
      SELECT sum(cs.cod_amount) AS gross,sum(cs.company_receives) AS net,
        count(*)>0 AND bool_and(cs.company_receives IS NOT NULL) AS known
      FROM public.courier_shipments cs
      WHERE NOT coalesce(cs.is_return,false)
        AND (cs.tracking_number=coalesce(nullif(o.tracking_number,''),nullif(o.onway_tracking,''))
          OR cs.onway_parent_tracking=coalesce(nullif(o.tracking_number,''),nullif(o.onway_tracking,'')))
    ) s ON true
  ) SELECT jsonb_build_object(
    'day',v_day,'batch_count',(SELECT count(DISTINCT batch_id) FROM scoped),
    'order_count',count(*),'total_with_fee',round(coalesce(sum(gross),0),2),
    'total_without_fee',CASE WHEN count(*) FILTER(WHERE NOT coalesce(known,false))=0 THEN round(coalesce(sum(net),0),2) ELSE NULL END,
    'known_net',round(coalesce(sum(net) FILTER(WHERE known),0),2),
    'pending_fee_orders',count(*) FILTER(WHERE NOT coalesce(known,false)),
    'courier_fees',round(coalesce(sum(gross-net) FILTER(WHERE known),0),2)
  ) INTO v_result FROM amounts;
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.courier_label_daily_stats(text,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.courier_label_daily_stats(text,date) TO authenticated, service_role;