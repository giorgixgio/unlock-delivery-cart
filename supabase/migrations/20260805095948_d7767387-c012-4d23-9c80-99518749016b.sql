CREATE TABLE public.product_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id text NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'ai',
  confidence numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (product_id, category)
);

CREATE INDEX idx_product_categories_category ON public.product_categories(category);
CREATE INDEX idx_product_categories_product ON public.product_categories(product_id);

GRANT SELECT ON public.product_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view product categories"
ON public.product_categories FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product categories"
ON public.product_categories FOR ALL
TO authenticated
USING (public.is_active_admin(auth.uid()))
WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TRIGGER trg_product_categories_updated_at
BEFORE UPDATE ON public.product_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();