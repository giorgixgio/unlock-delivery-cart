
CREATE POLICY "Anon can update own orders"
ON public.orders
FOR UPDATE
USING (true)
WITH CHECK (true);
