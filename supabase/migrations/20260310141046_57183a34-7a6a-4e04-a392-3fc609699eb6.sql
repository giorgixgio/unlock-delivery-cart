
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Anyone can read settings
CREATE POLICY "Anyone can read site_settings" ON public.site_settings FOR SELECT TO public USING (true);

-- Only admins can manage settings
CREATE POLICY "Admins can manage site_settings" ON public.site_settings FOR ALL TO public USING (is_active_admin(auth.uid())) WITH CHECK (is_active_admin(auth.uid()));

-- Seed with current threshold value
INSERT INTO public.site_settings (key, value) VALUES ('minimum_order_threshold', '24');
