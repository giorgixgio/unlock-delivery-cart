DELETE FROM public.product_scan_history a
USING public.product_scan_history b
WHERE a.typed_sku IS NOT NULL
  AND a.typed_sku = b.typed_sku
  AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));

ALTER TABLE public.product_scan_history
  ADD CONSTRAINT product_scan_history_typed_sku_key UNIQUE (typed_sku);

ALTER TABLE public.product_scan_history
  ADD COLUMN IF NOT EXISTS applied_as_reference boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

ALTER PUBLICATION supabase_realtime ADD TABLE public.product_scan_history;