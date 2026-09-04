ALTER TABLE public.wholesale_items ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;
ALTER TABLE public.wholesale_items ADD COLUMN IF NOT EXISTS carton_count integer NOT NULL DEFAULT 1;