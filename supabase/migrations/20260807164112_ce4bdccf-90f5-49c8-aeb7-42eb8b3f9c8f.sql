ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_reassigned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS previous_sku text,
  ADD COLUMN IF NOT EXISTS sku_reassigned_at timestamptz;