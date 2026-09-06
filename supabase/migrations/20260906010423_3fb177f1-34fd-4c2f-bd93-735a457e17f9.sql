ALTER TABLE public.wholesale_items
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS title_ru text;