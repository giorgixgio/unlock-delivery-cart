-- Allow anon to read back orders they just created (needed for .select() after insert)
CREATE POLICY "Anon can read own insert" ON public.orders FOR SELECT TO anon USING (true);

-- Allow anon to read order_items (needed for order confirmation)
CREATE POLICY "Anon can read own items" ON public.order_items FOR SELECT TO anon USING (true);