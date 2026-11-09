-- One rule for "test order", matching the admin Test orders tab:
-- an order with any line whose SKU is a test SKU (also carried as the 'test_sku' tag).
CREATE OR REPLACE FUNCTION public.is_test_sku(p_sku text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(trim(coalesce(p_sku,''))) IN ('999999','test1','test2','test3','test4','test5','test6','test7','test8','test9','testkrema','testwarbi')
$$;

CREATE OR REPLACE FUNCTION public.is_test_order(p_order_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND coalesce(o.tags,'{}') @> ARRAY['test_sku'])
      OR EXISTS (SELECT 1 FROM public.order_items i WHERE i.order_id = p_order_id AND public.is_test_sku(i.sku))
$$;
REVOKE ALL ON FUNCTION public.is_test_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_test_order(uuid) TO authenticated, service_role;

-- Hard guard: a test order can never become operational. Orders that already
-- leaked before this guard (sent to Onway / fulfilled) are left untouched.
CREATE OR REPLACE FUNCTION public.orders_test_isolation_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (coalesce(NEW.tags,'{}') @> ARRAY['test_sku'] OR public.is_test_order(NEW.id)) THEN RETURN NEW; END IF;
  IF OLD.onway_sent_at IS NOT NULL OR OLD.is_fulfilled IS TRUE OR nullif(trim(coalesce(OLD.onway_tracking,'')),'') IS NOT NULL THEN RETURN NEW; END IF;
  -- Shipping / packing actions are rejected outright.
  IF NEW.onway_sent_at IS NOT NULL
     OR NEW.is_fulfilled IS TRUE
     OR nullif(trim(coalesce(NEW.onway_tracking,'')),'') IS NOT NULL
     OR coalesce(NEW.onway_api_status,'') IS DISTINCT FROM coalesce(OLD.onway_api_status,'')
     OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
     OR (NEW.packing_wave_id IS NOT NULL AND NEW.packing_wave_id IS DISTINCT FROM OLD.packing_wave_id)
     OR (NEW.batch_id IS NOT NULL AND NEW.batch_id IS DISTINCT FROM OLD.batch_id)
     OR (NEW.courier_import_batch_id IS NOT NULL AND NEW.courier_import_batch_id IS DISTINCT FROM OLD.courier_import_batch_id) THEN
    RAISE EXCEPTION 'Test order #% cannot be shipped, packed or exported', OLD.public_order_number USING ERRCODE = '42501';
  END IF;
  -- Confirmation / operational status changes are silently kept back.
  IF NEW.is_confirmed IS TRUE AND OLD.is_confirmed IS NOT TRUE THEN NEW.is_confirmed := OLD.is_confirmed; END IF;
  IF NEW.auto_confirmed IS TRUE AND OLD.auto_confirmed IS NOT TRUE THEN
    NEW.auto_confirmed := OLD.auto_confirmed; NEW.auto_confirm_reason := OLD.auto_confirm_reason;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('new','pending_details','pending_address','canceled','cancelled','merged') THEN
    NEW.status := OLD.status;
  END IF;
  IF NEW.review_required IS TRUE AND OLD.review_required IS NOT TRUE THEN NEW.review_required := OLD.review_required; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS orders_test_isolation_guard_trg ON public.orders;
CREATE TRIGGER orders_test_isolation_guard_trg BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_test_isolation_guard();

-- No stock movement for test orders.
CREATE OR REPLACE FUNCTION public.deduct_order_stock_once(p_order_id uuid, p_actor uuid DEFAULT NULL::uuid, p_actor_email text DEFAULT NULL::text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_number text; v_affected integer := 0; r record; v_prev integer; v_new integer;
BEGIN
  SELECT public_order_number INTO v_number FROM public.orders WHERE id = p_order_id;
  IF v_number IS NULL THEN RETURN 0; END IF;
  IF public.is_test_order(p_order_id) THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.stock_activity_log WHERE order_id = p_order_id AND change_type = 'order_confirm') THEN RETURN 0; END IF;
  FOR r IN
    SELECT oi.product_id, SUM(oi.quantity)::integer AS qty
    FROM public.order_items oi JOIN public.products p ON p.id = oi.product_id
    WHERE oi.order_id = p_order_id GROUP BY oi.product_id
  LOOP
    SELECT COALESCE(stock_quantity, 0) INTO v_prev FROM public.products WHERE id = r.product_id FOR UPDATE;
    v_new := GREATEST(v_prev - r.qty, 0);
    UPDATE public.products SET stock_quantity = v_new WHERE id = r.product_id;
    INSERT INTO public.stock_activity_log
      (product_id, changed_by, changed_by_email, change_type, delta, previous_value, new_value, comment, order_id)
    VALUES (r.product_id, p_actor, p_actor_email, 'order_confirm', v_new - v_prev, v_prev, v_new,
       'Order #' || v_number || ' stock deducted', p_order_id);
    v_affected := v_affected + 1;
  END LOOP;
  RETURN v_affected;
END;
$function$;

-- No customer SMS queued for test orders.
CREATE OR REPLACE FUNCTION public.sms_enqueue(p_order_id uuid, p_type text, p_max_seq integer, p_send_after timestamp with time zone)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_num text; v_seq integer;
BEGIN
  SELECT public_order_number INTO v_num FROM orders WHERE id = p_order_id;
  IF v_num IS NULL THEN RETURN false; END IF;
  IF public.is_test_order(p_order_id) THEN RETURN false; END IF;
  SELECT coalesce(max(seq), 0) + 1 INTO v_seq FROM sms_queue WHERE order_number = v_num AND type = p_type;
  IF v_seq > p_max_seq THEN RETURN false; END IF;
  INSERT INTO sms_queue (order_id, order_number, type, seq, send_after)
  VALUES (p_order_id, v_num, p_type, v_seq, p_send_after) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $function$;

-- Packing waves never pick up test orders.
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
      AND NOT public.is_test_order(o.id)
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

-- Onway claim refuses test orders.
CREATE OR REPLACE FUNCTION public.onway_claim_shipment(p_order_id uuid, p_version integer)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE o public.orders; permit public.onway_order_reviews;
BEGIN
 IF public.is_test_order(p_order_id) THEN RETURN false; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF o.id IS NULL OR o.version<>p_version OR o.status<>'confirmed' OR NOT o.is_confirmed OR o.is_fulfilled OR nullif(trim(o.onway_tracking),'') IS NOT NULL OR o.onway_api_status='sent' THEN RETURN false; END IF;
 SELECT * INTO permit FROM public.onway_order_reviews WHERE order_id=p_order_id FOR UPDATE;
 IF o.onway_sent_at IS NOT NULL AND NOT(coalesce(permit.retry_permitted,false) AND permit.reviewed_version=o.version) THEN RETURN false; END IF;
 UPDATE public.onway_order_reviews SET retry_permitted=false WHERE order_id=p_order_id;
 UPDATE public.orders SET onway_sent_at=now(),onway_api_status='sending',onway_error_text=NULL,version=version+1 WHERE id=p_order_id;
 RETURN true;
END; $function$;