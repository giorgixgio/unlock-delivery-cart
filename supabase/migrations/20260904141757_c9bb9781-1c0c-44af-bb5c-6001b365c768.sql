ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS warehouse text;

UPDATE public.products SET warehouse = 'B' WHERE warehouse IS NULL;

ALTER TABLE public.products
  ALTER COLUMN warehouse SET DEFAULT 'B';

ALTER TABLE public.products
  ADD CONSTRAINT products_warehouse_check CHECK (warehouse IS NULL OR warehouse IN ('A','B'));

CREATE INDEX IF NOT EXISTS idx_products_warehouse ON public.products(warehouse);

ALTER TABLE public.wholesale_items
  ADD COLUMN IF NOT EXISTS selling_price numeric;