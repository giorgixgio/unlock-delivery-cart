-- Fix orders policies
DROP POLICY IF EXISTS "Active admins can view orders" ON public.orders;
DROP POLICY IF EXISTS "Active admins can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Active admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Active admins can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Storefront can create orders" ON public.orders;

CREATE POLICY "Active admins can view orders" ON public.orders FOR SELECT TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can insert orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can update orders" ON public.orders FOR UPDATE TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can delete orders" ON public.orders FOR DELETE TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Storefront can create orders" ON public.orders FOR INSERT TO anon WITH CHECK (true);

-- Fix order_items policies
DROP POLICY IF EXISTS "Active admins can view order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active admins can insert order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active admins can update order_items" ON public.order_items;
DROP POLICY IF EXISTS "Active admins can delete order_items" ON public.order_items;
DROP POLICY IF EXISTS "Storefront can create order_items" ON public.order_items;

CREATE POLICY "Active admins can view order_items" ON public.order_items FOR SELECT TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can insert order_items" ON public.order_items FOR INSERT TO authenticated WITH CHECK (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can update order_items" ON public.order_items FOR UPDATE TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can delete order_items" ON public.order_items FOR DELETE TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Storefront can create order_items" ON public.order_items FOR INSERT TO anon WITH CHECK (true);

-- Fix order_events policies
DROP POLICY IF EXISTS "Active admins can view order_events" ON public.order_events;
DROP POLICY IF EXISTS "Active admins can insert order_events" ON public.order_events;
DROP POLICY IF EXISTS "Active admins can update order_events" ON public.order_events;
DROP POLICY IF EXISTS "Storefront can create order_events" ON public.order_events;

CREATE POLICY "Active admins can view order_events" ON public.order_events FOR SELECT TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can insert order_events" ON public.order_events FOR INSERT TO authenticated WITH CHECK (is_active_admin(auth.uid()));
CREATE POLICY "Active admins can update order_events" ON public.order_events FOR UPDATE TO authenticated USING (is_active_admin(auth.uid()));
CREATE POLICY "Storefront can create order_events" ON public.order_events FOR INSERT TO anon WITH CHECK (true);