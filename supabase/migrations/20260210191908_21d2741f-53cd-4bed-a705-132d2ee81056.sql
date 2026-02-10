-- Allow any user (authenticated or anon) to create orders from storefront
DROP POLICY IF EXISTS "Storefront can create orders" ON public.orders;
CREATE POLICY "Anyone can create orders" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Storefront can create order_items" ON public.order_items;
CREATE POLICY "Anyone can create order_items" ON public.order_items FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Storefront can create order_events" ON public.order_events;
CREATE POLICY "Anyone can create order_events" ON public.order_events FOR INSERT WITH CHECK (true);