ALTER TABLE public.wholesale_items
  ADD COLUMN IF NOT EXISTS alibaba_title text,
  ADD COLUMN IF NOT EXISTS supplier_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_wholesale_items_supplier_group_id
  ON public.wholesale_items (supplier_group_id);