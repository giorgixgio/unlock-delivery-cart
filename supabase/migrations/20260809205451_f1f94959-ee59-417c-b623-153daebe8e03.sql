ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT true;

WITH v AS (
  SELECT id FROM public.products WHERE sku_locked
  UNION SELECT confirmed_product_id FROM public.product_scan_history WHERE confirmed_product_id IS NOT NULL
  UNION SELECT matched_product_id FROM public.product_scan_history WHERE matched_product_id IS NOT NULL AND status = 'confirmed'
  UNION SELECT resolved_product_id FROM public.unidentified_items WHERE resolved_product_id IS NOT NULL
)
UPDATE public.products p
SET is_verified = (
  p.id IN (SELECT id FROM v)
  AND COALESCE(trim(p.sku), '') <> ''
  AND p.sku !~ '^1[0-9]{3,}$'
);

CREATE INDEX IF NOT EXISTS idx_products_is_verified ON public.products (is_verified);