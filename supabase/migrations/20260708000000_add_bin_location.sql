-- Phase 1: Warehouse bin locations
-- Adds a shelf/bin position to products that is INDEPENDENT of the SKU.
-- Currently SKU == position, so we seed bin_location from sku, but going
-- forward the two are separate editable fields.
-- This migration is idempotent (safe to re-run).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bin_location text;

-- Seed existing rows from SKU (only fills blanks; never overwrites a value
-- you've already set). Re-mapping later happens via the Bin Locations admin
-- page / CSV import, not here.
UPDATE public.products
  SET bin_location = sku
  WHERE bin_location IS NULL
    AND sku IS NOT NULL
    AND sku <> '';

-- Index for fast lookup + ordering by shelf position during picking.
CREATE INDEX IF NOT EXISTS idx_products_bin_location
  ON public.products (bin_location);

COMMENT ON COLUMN public.products.bin_location IS
  'Physical warehouse shelf/bin position. Independent of SKU. Used to sort pick paths.';
