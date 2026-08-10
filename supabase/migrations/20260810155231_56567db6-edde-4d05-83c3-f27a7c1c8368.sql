CREATE TABLE IF NOT EXISTS public.courier_zone_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_name text NOT NULL,
  zone_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS courier_zone_codes_city_uniq
  ON public.courier_zone_codes (lower(btrim(city_name)));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_zone_codes TO authenticated;
GRANT ALL ON public.courier_zone_codes TO service_role;

ALTER TABLE public.courier_zone_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read courier zone codes"
  ON public.courier_zone_codes FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Admins can manage courier zone codes"
  ON public.courier_zone_codes FOR ALL TO authenticated
  USING (public.is_active_admin(auth.uid()))
  WITH CHECK (public.is_active_admin(auth.uid()));

CREATE TRIGGER courier_zone_codes_updated_at
  BEFORE UPDATE ON public.courier_zone_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_zone_id text,
  ADD COLUMN IF NOT EXISTS courier_label_text text,
  ADD COLUMN IF NOT EXISTS courier_label_date date;