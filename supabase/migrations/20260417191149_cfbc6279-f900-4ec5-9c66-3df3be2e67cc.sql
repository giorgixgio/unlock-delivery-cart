CREATE TABLE public.presentation_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_email text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  revenue_multiplier numeric NOT NULL DEFAULT 1.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT presentation_multiplier_range CHECK (revenue_multiplier >= 0 AND revenue_multiplier <= 1)
);

ALTER TABLE public.presentation_settings ENABLE ROW LEVEL SECURITY;

-- Super-admin full control
CREATE POLICY "Super admin manages presentation_settings"
  ON public.presentation_settings
  FOR ALL
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid())::text = 'info@bigmart.ge'
  )
  WITH CHECK (
    (SELECT email FROM auth.users WHERE id = auth.uid())::text = 'info@bigmart.ge'
  );

-- Allow each authenticated user to read their own row (so the client can detect active presentation mode)
CREATE POLICY "Users can read own presentation row"
  ON public.presentation_settings
  FOR SELECT
  USING (
    lower(target_email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())::text)
  );

CREATE TRIGGER presentation_settings_updated_at
  BEFORE UPDATE ON public.presentation_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.presentation_settings (target_email, is_active, revenue_multiplier)
VALUES ('lado@bigmart.ge', true, 0.4);