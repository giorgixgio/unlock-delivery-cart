CREATE TABLE public.import_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text,
  name text NOT NULL DEFAULT 'Untitled',
  product_id text,
  product_sku text,
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_calculations TO authenticated;
GRANT ALL ON public.import_calculations TO service_role;
ALTER TABLE public.import_calculations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage import calculations" ON public.import_calculations FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid())) WITH CHECK (public.is_active_admin(auth.uid()));
CREATE INDEX import_calculations_product_idx ON public.import_calculations(product_id);