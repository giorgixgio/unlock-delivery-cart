-- Track "typed SKU" vs "actually confirmed SKU" explicitly, so mislabeled
-- boxes show up as a clean queryable field instead of requiring a join.
ALTER TABLE public.product_scan_history
  ADD COLUMN IF NOT EXISTS corrected_sku text;

COMMENT ON COLUMN public.product_scan_history.corrected_sku IS
  'SKU of the product actually confirmed at scan time. Compare to typed_sku to find mislabeled boxes (differs = the box sticker was wrong).';