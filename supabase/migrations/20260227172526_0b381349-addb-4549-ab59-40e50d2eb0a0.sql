
-- Allow any authenticated user to SELECT their own modifier row (they won't know what it means)
CREATE POLICY "Users can read own modifier"
  ON public.dashboard_view_modifiers
  FOR SELECT
  USING (
    target_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );
