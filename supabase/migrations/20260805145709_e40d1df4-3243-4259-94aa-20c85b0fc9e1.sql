CREATE TABLE IF NOT EXISTS public.product_scan_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor text,
  typed_sku text,
  position text,
  photo_url text not null,
  matched_product_id text references public.products(id),
  confidence numeric,
  status text not null default 'pending',
  candidates jsonb,
  confirmed_product_id text references public.products(id),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON public.product_scan_history (created_at desc);
CREATE INDEX IF NOT EXISTS idx_scan_history_status ON public.product_scan_history (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_scan_history TO authenticated;
GRANT ALL ON public.product_scan_history TO service_role;

ALTER TABLE public.product_scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to scan history" ON public.product_scan_history;
DROP POLICY IF EXISTS "Admins manage scan history" ON public.product_scan_history;
CREATE POLICY "Admins manage scan history"
  ON public.product_scan_history FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow anon insert to product-scans" ON storage.objects;
DROP POLICY IF EXISTS "Admins upload product-scans" ON storage.objects;
CREATE POLICY "Admins upload product-scans"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-scans' AND public.is_active_admin(auth.uid()));

DROP POLICY IF EXISTS "Allow public read product-scans" ON storage.objects;
DROP POLICY IF EXISTS "Admins read product-scans" ON storage.objects;
CREATE POLICY "Admins read product-scans"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-scans' AND public.is_active_admin(auth.uid()));

COMMENT ON TABLE public.product_scan_history IS
  'Warehouse camera-scan audit log: verifies a physical box against its claimed SKU via AI vision, and records/confirms bin_location.';