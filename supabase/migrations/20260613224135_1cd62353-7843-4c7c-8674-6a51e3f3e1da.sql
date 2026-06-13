
ALTER TABLE public.product_landing_config
  ADD COLUMN IF NOT EXISTS landing_upsell_enabled boolean;

INSERT INTO public.site_settings (key, value)
VALUES ('landing_upsells_enabled', 'true')
ON CONFLICT (key) DO NOTHING;
