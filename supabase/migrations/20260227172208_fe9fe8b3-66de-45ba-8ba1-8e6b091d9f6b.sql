
-- Table to store dashboard view modifiers (hidden from target users)
CREATE TABLE public.dashboard_view_modifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_email text NOT NULL UNIQUE,
  revenue_multiplier numeric NOT NULL DEFAULT 1.0,
  order_count_multiplier numeric NOT NULL DEFAULT 1.0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_view_modifiers ENABLE ROW LEVEL SECURITY;

-- Only the main admin (info@bigmart.ge) can see/manage this table
CREATE POLICY "Only super admin can manage modifiers"
  ON public.dashboard_view_modifiers
  FOR ALL
  USING (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'info@bigmart.ge'
  )
  WITH CHECK (
    (SELECT email FROM auth.users WHERE id = auth.uid()) = 'info@bigmart.ge'
  );
