ALTER TABLE public.product_scan_history DROP CONSTRAINT IF EXISTS product_scan_history_typed_sku_key;
CREATE INDEX IF NOT EXISTS idx_scan_history_typed_sku ON public.product_scan_history (typed_sku);
CREATE INDEX IF NOT EXISTS idx_scan_history_confirmed_product ON public.product_scan_history (confirmed_product_id);