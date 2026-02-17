
-- Landing config per product (keyed by Shopify handle)
CREATE TABLE public.product_landing_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_handle text NOT NULL UNIQUE,
  landing_variant text NOT NULL DEFAULT 'generic',
  landing_config jsonb,
  landing_use_cod_modal boolean NOT NULL DEFAULT false,
  landing_bypass_min_cart boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Anyone can read (storefront needs it), admins can manage
ALTER TABLE public.product_landing_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read landing config"
  ON public.product_landing_config FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage landing config"
  ON public.product_landing_config FOR ALL
  USING (is_active_admin(auth.uid()));

-- Auto-update updated_at
CREATE TRIGGER update_product_landing_config_updated_at
  BEFORE UPDATE ON public.product_landing_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
