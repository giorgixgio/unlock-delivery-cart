
-- ============================================================
-- 1. ORDERS: replace USING(true) policies
-- ============================================================
DROP POLICY IF EXISTS "Anon can read own insert" ON public.orders;
DROP POLICY IF EXISTS "Anon can update own orders" ON public.orders;

-- Anon can read only fresh orders (last 2 hours) — enough for the
-- checkout/bump/success flow, blocks bulk PII enumeration of history.
CREATE POLICY "Anon can read fresh orders" ON public.orders
  FOR SELECT TO anon
  USING (created_at > now() - interval '2 hours');

-- Anon can update only fresh, still-unconfirmed orders (checkout can still
-- attach address, tags, totals; can no longer touch a confirmed order).
CREATE POLICY "Anon can update fresh unconfirmed orders" ON public.orders
  FOR UPDATE TO anon
  USING (created_at > now() - interval '2 hours' AND COALESCE(is_confirmed, false) = false)
  WITH CHECK (COALESCE(is_confirmed, false) = false);

-- Column-level guard: prevent anon from mutating sensitive fields even on a
-- fresh unconfirmed row (status transitions, confirmation flags, etc.).
CREATE OR REPLACE FUNCTION public.orders_anon_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) = 'anon' OR auth.role() = 'anon' THEN
    IF NEW.is_confirmed IS DISTINCT FROM OLD.is_confirmed
       OR NEW.auto_confirmed IS DISTINCT FROM OLD.auto_confirmed
       OR NEW.is_fulfilled IS DISTINCT FROM OLD.is_fulfilled
       OR NEW.confirmed_by IS DISTINCT FROM OLD.confirmed_by
       OR NEW.canceled_by IS DISTINCT FROM OLD.canceled_by
       OR NEW.review_required IS DISTINCT FROM OLD.review_required
       OR NEW.risk_score IS DISTINCT FROM OLD.risk_score
       OR NEW.risk_level IS DISTINCT FROM OLD.risk_level
       OR NEW.packing_wave_id IS DISTINCT FROM OLD.packing_wave_id
       OR NEW.packing_status IS DISTINCT FROM OLD.packing_status
       OR NEW.public_order_number IS DISTINCT FROM OLD.public_order_number
       OR NEW.tracking_number IS DISTINCT FROM OLD.tracking_number
    THEN
      RAISE EXCEPTION 'anon cannot modify protected order columns';
    END IF;
    -- Anon may only move status among storefront-owned values
    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status NOT IN ('new','pending_details','pending_address') THEN
      RAISE EXCEPTION 'anon cannot set status to %', NEW.status;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_anon_update_guard_trg ON public.orders;
CREATE TRIGGER orders_anon_update_guard_trg
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_anon_update_guard();

-- ============================================================
-- 2. ORDER_ITEMS: drop broad anon SELECT, scope anon INSERT
-- ============================================================
DROP POLICY IF EXISTS "Anon can read own items" ON public.order_items;
DROP POLICY IF EXISTS "Anyone can create order_items" ON public.order_items;

CREATE POLICY "Anon can insert items on fresh order" ON public.order_items
  FOR INSERT TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.created_at > now() - interval '2 hours'
        AND COALESCE(o.is_confirmed, false) = false
    )
  );

-- ============================================================
-- 3. ORDER_EVENTS: scope anon INSERT to storefront event types
-- ============================================================
DROP POLICY IF EXISTS "Anyone can create order_events" ON public.order_events;

CREATE POLICY "Anon can log storefront order events" ON public.order_events
  FOR INSERT TO anon
  WITH CHECK (
    actor IN ('system','storefront')
    AND event_type IN (
      'status_change','bump_accepted','bump_declined',
      'address_added','address_skipped','phone_submitted',
      'landing_view','address_partial'
    )
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND o.created_at > now() - interval '2 hours'
    )
  );

-- ============================================================
-- 4. SYSTEM_EVENTS: admin-only reads; scoped anon INSERT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can read system_events" ON public.system_events;
DROP POLICY IF EXISTS "Anyone can insert system_events" ON public.system_events;

CREATE POLICY "Anon can log storefront system events" ON public.system_events
  FOR INSERT TO anon
  WITH CHECK (
    entity_type IN ('order','variant')
    AND event_type IN (
      'ORDER_CREATE','ORDER_SAVE','ORDER_STATUS_SET'
    )
  );

-- ============================================================
-- 5. STORAGE: block public listing of product-images
--    Public reads via public URL still work — that path bypasses RLS.
-- ============================================================
DROP POLICY IF EXISTS "Public can read product images" ON storage.objects;

-- ============================================================
-- 6. REVOKE execute on admin-only functions from anon
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.is_active_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_packing_wave(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.assign_packing_run_slots(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_packing_wave(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bulk_update_tracking(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) FROM anon, public;
-- authenticated (admin session) still keeps execute
GRANT EXECUTE ON FUNCTION public.is_active_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_packing_wave(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_packing_run_slots(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_packing_wave(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_tracking(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) TO authenticated;
-- record_stockout_attempt is intentionally callable by anon storefront

-- ============================================================
-- 7. RPCs for storefront (SECURITY DEFINER, tight allowlists)
-- ============================================================

-- Look up the most recent known address for a phone number.
-- Returns only address fields — no order id/status/PII of other people.
CREATE OR REPLACE FUNCTION public.storefront_get_last_address_by_phone(p_phone text)
RETURNS TABLE(city text, region text, address_line1 text, normalized_city text, normalized_address text, is_tbilisi boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last9 text;
BEGIN
  v_last9 := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_last9 := right(v_last9, 9);
  IF length(v_last9) < 6 THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT o.city, o.region, o.address_line1, o.normalized_city, o.normalized_address, o.is_tbilisi
    FROM public.orders o
    WHERE o.customer_phone ILIKE '%' || v_last9
      AND o.address_line1 IS NOT NULL AND o.address_line1 <> ''
      AND o.status <> 'merged'
    ORDER BY o.created_at DESC
    LIMIT 1;
END;
$$;

-- Autocomplete: return recent distinct normalized cities and addresses.
CREATE OR REPLACE FUNCTION public.storefront_recent_cities(p_limit int DEFAULT 200)
RETURNS TABLE(city text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT normalized_city
  FROM public.orders
  WHERE normalized_city IS NOT NULL AND normalized_city <> ''
    AND created_at > now() - interval '90 days'
  ORDER BY normalized_city
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.storefront_recent_addresses(p_limit int DEFAULT 200)
RETURNS TABLE(address text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT normalized_address
  FROM public.orders
  WHERE normalized_address IS NOT NULL AND normalized_address <> ''
    AND created_at > now() - interval '90 days'
  ORDER BY normalized_address
  LIMIT p_limit;
$$;

-- Update address on a fresh unconfirmed order (RPC path preferred).
CREATE OR REPLACE FUNCTION public.storefront_update_order_address(
  p_order_id uuid,
  p_city text,
  p_region text,
  p_address_line1 text,
  p_is_tbilisi boolean,
  p_address_status text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_address_status NOT IN ('completed','partial','missing') THEN
    RAISE EXCEPTION 'invalid address_status';
  END IF;
  UPDATE public.orders
  SET city = p_city,
      region = p_region,
      address_line1 = p_address_line1,
      raw_city = p_city,
      raw_address = p_address_line1,
      is_tbilisi = p_is_tbilisi,
      status = 'new',
      address_status = p_address_status,
      address_added_at = now(),
      skipped_address = false
  WHERE id = p_order_id
    AND created_at > now() - interval '24 hours'
    AND COALESCE(is_confirmed, false) = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.storefront_mark_address_skipped(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.orders
  SET skipped_address = true, address_status = 'missing'
  WHERE id = p_order_id
    AND created_at > now() - interval '24 hours'
    AND COALESCE(is_confirmed, false) = false;
END;
$$;

-- Apply a bump offer to a fresh unconfirmed order.
CREATE OR REPLACE FUNCTION public.storefront_apply_bump(
  p_order_id uuid,
  p_product_id text,
  p_sku text,
  p_title text,
  p_quantity int,
  p_unit_price numeric,
  p_line_total numeric,
  p_image_url text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT (created_at > now() - interval '2 hours' AND COALESCE(is_confirmed, false) = false)
    INTO v_ok FROM public.orders WHERE id = p_order_id;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'order not eligible for bump';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 20 THEN
    RAISE EXCEPTION 'invalid bump quantity';
  END IF;

  INSERT INTO public.order_items (order_id, product_id, sku, title, quantity, unit_price, line_total, image_url, tags)
  VALUES (p_order_id, p_product_id, p_sku, p_title, p_quantity, p_unit_price, p_line_total, coalesce(p_image_url, ''), ARRAY['is_bump']);

  UPDATE public.orders
  SET total = COALESCE(total, 0) + p_line_total,
      subtotal = COALESCE(subtotal, 0) + p_line_total,
      status = 'new',
      tags = COALESCE(tags, ARRAY[]::text[]) || ARRAY['bump_accepted']
  WHERE id = p_order_id;
END;
$$;

-- Log a storefront order event (restricted event types).
CREATE OR REPLACE FUNCTION public.storefront_log_order_event(
  p_order_id uuid,
  p_actor text,
  p_event_type text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_actor NOT IN ('system','storefront') THEN
    RAISE EXCEPTION 'invalid actor';
  END IF;
  IF p_event_type NOT IN (
    'status_change','bump_accepted','bump_declined',
    'address_added','address_skipped','phone_submitted',
    'landing_view','address_partial'
  ) THEN
    RAISE EXCEPTION 'event_type not allowed from storefront';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND created_at > now() - interval '2 hours') THEN
    RAISE EXCEPTION 'order not eligible';
  END IF;
  INSERT INTO public.order_events (order_id, actor, event_type, payload)
  VALUES (p_order_id, p_actor, p_event_type, coalesce(p_payload, '{}'::jsonb));
END;
$$;

-- Log a storefront system event (allowlisted types only).
CREATE OR REPLACE FUNCTION public.storefront_log_system_event(
  p_entity_type text,
  p_entity_id text,
  p_event_type text,
  p_actor_id text,
  p_payload jsonb,
  p_status text,
  p_error_message text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_entity_type NOT IN ('order','variant') THEN
    RAISE EXCEPTION 'invalid entity_type';
  END IF;
  IF p_event_type NOT IN ('ORDER_CREATE','ORDER_SAVE','ORDER_STATUS_SET') THEN
    RAISE EXCEPTION 'event_type not allowed from storefront';
  END IF;
  IF p_status NOT IN ('SUCCESS','FAILED') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  INSERT INTO public.system_events (entity_type, entity_id, event_type, actor_id, payload_json, status, error_message)
  VALUES (p_entity_type, p_entity_id, p_event_type, p_actor_id, coalesce(p_payload, '{}'::jsonb), p_status, p_error_message);
END;
$$;

-- Grant execute on storefront RPCs
GRANT EXECUTE ON FUNCTION public.storefront_get_last_address_by_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_recent_cities(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_recent_addresses(int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_update_order_address(uuid, text, text, text, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_mark_address_skipped(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_apply_bump(uuid, text, text, text, int, numeric, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_log_order_event(uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_log_system_event(text, text, text, text, jsonb, text, text) TO anon, authenticated;
