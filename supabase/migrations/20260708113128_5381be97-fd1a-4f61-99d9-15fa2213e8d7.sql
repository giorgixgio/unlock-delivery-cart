ALTER TABLE public.products ADD COLUMN IF NOT EXISTS bin_location text;
UPDATE public.products SET bin_location = sku WHERE bin_location IS NULL AND sku IS NOT NULL AND sku <> '';
CREATE INDEX IF NOT EXISTS idx_products_bin_location ON public.products (bin_location);
COMMENT ON COLUMN public.products.bin_location IS 'Physical warehouse shelf/bin position. Independent of SKU. Used to sort pick paths.';