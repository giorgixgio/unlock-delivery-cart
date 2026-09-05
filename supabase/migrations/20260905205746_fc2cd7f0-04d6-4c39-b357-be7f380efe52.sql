CREATE TABLE public.admin_preferences (
  user_id uuid PRIMARY KEY,
  default_store text CHECK (default_store IN ('A', 'B', 'ALL')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_preferences TO authenticated;
GRANT ALL ON public.admin_preferences TO service_role;

ALTER TABLE public.admin_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view own admin preference"
ON public.admin_preferences
FOR SELECT
TO authenticated
USING (auth.uid() = user_id AND public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can create own admin preference"
ON public.admin_preferences
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can update own admin preference"
ON public.admin_preferences
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id AND public.is_active_staff(auth.uid()))
WITH CHECK (auth.uid() = user_id AND public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can delete own admin preference"
ON public.admin_preferences
FOR DELETE
TO authenticated
USING (auth.uid() = user_id AND public.is_active_staff(auth.uid()));

CREATE TRIGGER update_admin_preferences_updated_at
BEFORE UPDATE ON public.admin_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();