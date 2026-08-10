-- 1) Staff helper: any active staff member (admin, operator, warehouse)
CREATE OR REPLACE FUNCTION public.is_active_staff(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE lower(au.email) = lower((SELECT email FROM auth.users WHERE id = user_id))
      AND au.is_active = true
  );
$$;

-- 2) is_active_admin now EXCLUDES restricted roles (warehouse/scanner),
--    so every existing admin RLS policy denies warehouse accounts.
CREATE OR REPLACE FUNCTION public.is_active_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
    WHERE lower(au.email) = lower((SELECT email FROM auth.users WHERE id = user_id))
      AND au.is_active = true
      AND au.role NOT IN ('warehouse', 'scanner')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_active_staff(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff(uuid) TO authenticated, service_role;

-- 3) Product-side tables stay open to all staff (incl. warehouse)
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Staff can manage products" ON public.products
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage stock overrides" ON public.product_stock_overrides;
CREATE POLICY "Staff can manage stock overrides" ON public.product_stock_overrides
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage product categories" ON public.product_categories;
CREATE POLICY "Staff can manage product categories" ON public.product_categories
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "Admins manage scan history" ON public.product_scan_history;
CREATE POLICY "Staff manage scan history" ON public.product_scan_history
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

-- 4) unidentified_items: no more public read/write
DROP POLICY IF EXISTS "Allow all operations on unidentified_items" ON public.unidentified_items;
REVOKE ALL ON public.unidentified_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidentified_items TO authenticated;
GRANT ALL ON public.unidentified_items TO service_role;
CREATE POLICY "Staff manage unidentified items" ON public.unidentified_items
  FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

-- 5) idempotency_keys: remove public SELECT, keep anon INSERT
DROP POLICY IF EXISTS "Anyone can read idempotency_keys" ON public.idempotency_keys;
DROP POLICY IF EXISTS "Admins can manage idempotency_keys" ON public.idempotency_keys;
CREATE POLICY "Admins can manage idempotency_keys" ON public.idempotency_keys
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));
REVOKE SELECT ON public.idempotency_keys FROM anon;

-- 6) Admin-only SECURITY DEFINER functions must not be callable anonymously
REVOKE EXECUTE ON FUNCTION public.assign_packing_run_slots(uuid, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bulk_update_tracking(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.complete_packing_wave(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.create_packing_wave(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.match_products_by_fingerprint(text, text, integer) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.assign_packing_run_slots(uuid, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bulk_update_tracking(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_packing_wave(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_packing_wave(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_stockout_waitlist(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_products_by_fingerprint(text, text, integer) TO authenticated, service_role;