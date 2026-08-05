-- Product SKU scan / warehouse audit
-- Table logging every camera scan (matched, mismatched, flagged) plus
-- a public storage bucket to hold the scan photos. Idempotent / safe to re-run.

CREATE TABLE IF NOT EXISTS public.product_scan_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor text,
  typed_sku text,
  position text,
  photo_url text not null,
  matched_product_id uuid references public.products(id),
  confidence numeric,
  status text not null default 'pending', -- pending | matched | mismatch | flagged | confirmed
  candidates jsonb,
  confirmed_product_id uuid references public.products(id),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_scan_history_created_at ON public.product_scan_history (created_at desc);
CREATE INDEX IF NOT EXISTS idx_scan_history_status ON public.product_scan_history (status);

ALTER TABLE public.product_scan_history ENABLE ROW LEVEL SECURITY;

-- Matches the permissive pattern already used by your other admin tables
-- (anon-key admin access, no Supabase Auth layer yet).
DROP POLICY IF EXISTS "Allow all access to scan history" ON public.product_scan_history;
CREATE POLICY "Allow all access to scan history"
  ON public.product_scan_history FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for the worker-taken photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-scans', 'product-scans', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow anon insert to product-scans" ON storage.objects;
CREATE POLICY "Allow anon insert to product-scans"
  ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'product-scans');

DROP POLICY IF EXISTS "Allow public read product-scans" ON storage.objects;
CREATE POLICY "Allow public read product-scans"
  ON storage.objects FOR SELECT USING (bucket_id = 'product-scans');

COMMENT ON TABLE public.product_scan_history IS
  'Warehouse camera-scan audit log: verifies a physical box against its claimed SKU via AI vision, and records/confirms bin_location.';
