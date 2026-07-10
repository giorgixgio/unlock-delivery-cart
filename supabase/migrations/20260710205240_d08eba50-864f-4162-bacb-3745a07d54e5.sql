
CREATE OR REPLACE FUNCTION public.bulk_update_tracking(rows jsonb)
 RETURNS TABLE(updated_count integer, missing_order_ids text[])
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_updated integer := 0;
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  WITH incoming AS (
    SELECT (elem->>'order_id')::uuid AS order_id,
           NULLIF(trim(elem->>'tracking_number'), '') AS tracking_number
    FROM jsonb_array_elements(rows) AS elem
  ),
  filtered AS (SELECT order_id, tracking_number FROM incoming WHERE order_id IS NOT NULL AND tracking_number IS NOT NULL),
  upd AS (
    UPDATE public.orders o SET tracking_number = f.tracking_number, updated_at = now()
    FROM filtered f WHERE o.id = f.order_id AND (o.tracking_number IS DISTINCT FROM f.tracking_number)
    RETURNING o.id
  )
  SELECT (SELECT count(*)::int FROM upd),
         ARRAY(SELECT DISTINCT (elem->>'order_id') FROM jsonb_array_elements(rows) AS elem
               WHERE (elem->>'order_id') IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM public.orders o2 WHERE o2.id = (elem->>'order_id')::uuid))
  INTO v_updated, v_missing;
  updated_count := v_updated; missing_order_ids := v_missing; RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_packing_wave(actor text)
 RETURNS TABLE(wave_id uuid, wave_number bigint, total integer, single_sku integer, multi_sku integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_wave_id uuid; v_wave_number bigint;
  v_total integer := 0; v_single integer := 0; v_multi integer := 0;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  INSERT INTO public.packing_waves (created_by, status) VALUES (actor, 'draft')
  RETURNING id, packing_waves.wave_number INTO v_wave_id, v_wave_number;
  WITH eligible AS (
    SELECT o.id AS order_id, COUNT(DISTINCT oi.sku) AS sku_count,
           COALESCE(SUM(oi.quantity), 0)::int AS total_qty,
           (ARRAY_AGG(oi.sku ORDER BY oi.sku))[1] AS primary_sku
    FROM public.orders o JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.is_confirmed = true AND o.is_fulfilled = false AND o.status = 'confirmed'
      AND o.packing_wave_id IS NULL AND COALESCE(o.customer_phone, '') <> ''
    GROUP BY o.id
  ),
  inserted AS (
    INSERT INTO public.packing_wave_orders (wave_id, order_id, classification, primary_sku, sku_count, total_qty)
    SELECT v_wave_id, e.order_id,
           CASE WHEN e.sku_count > 1 THEN 'multi_sku' ELSE 'single_sku' END,
           e.primary_sku, e.sku_count::int, e.total_qty
    FROM eligible e ON CONFLICT (order_id) DO NOTHING
    RETURNING order_id, classification
  )
  SELECT COUNT(*)::int,
         COUNT(*) FILTER (WHERE classification = 'single_sku')::int,
         COUNT(*) FILTER (WHERE classification = 'multi_sku')::int
  INTO v_total, v_single, v_multi FROM inserted;
  UPDATE public.orders o SET packing_wave_id = v_wave_id
  FROM public.packing_wave_orders pwo WHERE pwo.wave_id = v_wave_id AND pwo.order_id = o.id;
  wave_id := v_wave_id; wave_number := v_wave_number;
  total := v_total; single_sku := v_single; multi_sku := v_multi; RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_packing_run_slots(p_wave_id uuid, p_slot_count integer, actor text)
 RETURNS TABLE(run_id uuid, run_number integer, assigned integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid; v_run_number integer; v_assigned integer := 0;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF p_slot_count IS NULL OR p_slot_count < 1 THEN RAISE EXCEPTION 'slot_count must be >= 1'; END IF;
  SELECT COALESCE(MAX(run_number), 0) + 1 INTO v_run_number FROM public.packing_runs WHERE wave_id = p_wave_id;
  INSERT INTO public.packing_runs (wave_id, run_number, slot_count, created_by)
  VALUES (p_wave_id, v_run_number, p_slot_count, actor) RETURNING id INTO v_run_id;
  WITH candidates AS (
    SELECT pwo.order_id, o.tracking_number, o.created_at
    FROM public.packing_wave_orders pwo JOIN public.orders o ON o.id = pwo.order_id
    LEFT JOIN public.packing_run_slots prs ON prs.order_id = pwo.order_id AND prs.wave_id = p_wave_id
    WHERE pwo.wave_id = p_wave_id AND pwo.classification = 'multi_sku'
      AND pwo.packing_status IN ('not_packed', 'packing') AND prs.id IS NULL
    ORDER BY o.created_at ASC, o.id ASC LIMIT p_slot_count
  ),
  numbered AS (SELECT order_id, tracking_number, ROW_NUMBER() OVER (ORDER BY created_at ASC, order_id ASC) AS slot_number FROM candidates),
  ins AS (
    INSERT INTO public.packing_run_slots (run_id, wave_id, slot_number, order_id, tracking_number_snapshot)
    SELECT v_run_id, p_wave_id, n.slot_number::int, n.order_id, n.tracking_number FROM numbered n RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_assigned FROM ins;
  run_id := v_run_id; run_number := v_run_number; assigned := v_assigned; RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_packing_wave(p_wave_id uuid, p_force boolean, actor text)
 RETURNS TABLE(completed boolean, unpacked integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_unpacked integer;
BEGIN
  IF NOT public.is_active_admin(auth.uid()) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  SELECT COUNT(*)::int INTO v_unpacked FROM public.packing_wave_orders WHERE wave_id = p_wave_id AND packing_status <> 'packed';
  IF v_unpacked > 0 AND NOT p_force THEN
    completed := false; unpacked := v_unpacked; RETURN NEXT; RETURN;
  END IF;
  UPDATE public.packing_waves SET status = 'completed', completed_at = now(), completed_by = actor WHERE id = p_wave_id;
  completed := true; unpacked := v_unpacked; RETURN NEXT;
END;
$function$;
