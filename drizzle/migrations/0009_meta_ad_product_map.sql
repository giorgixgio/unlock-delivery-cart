CREATE TABLE IF NOT EXISTS public.meta_ad_product_map (
  ad_id text PRIMARY KEY,
  ad_name text,
  product_sku text NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_ad_product_map TO authenticated;
GRANT ALL ON public.meta_ad_product_map TO service_role;
ALTER TABLE public.meta_ad_product_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage meta ad map" ON public.meta_ad_product_map
  FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));