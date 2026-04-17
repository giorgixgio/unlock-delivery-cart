-- Fix presentation_settings policies to avoid querying auth.users (permission denied)
DROP POLICY IF EXISTS "Super admin manages presentation_settings" ON public.presentation_settings;
DROP POLICY IF EXISTS "Users can read own presentation row" ON public.presentation_settings;

CREATE POLICY "Super admin manages presentation_settings"
ON public.presentation_settings
FOR ALL
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@bigmart.ge')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@bigmart.ge');

CREATE POLICY "Users can read own presentation row"
ON public.presentation_settings
FOR SELECT
USING (lower(target_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Same fix for dashboard_view_modifiers (same pattern, same risk)
DROP POLICY IF EXISTS "Only super admin can manage modifiers" ON public.dashboard_view_modifiers;
DROP POLICY IF EXISTS "Users can read own modifier" ON public.dashboard_view_modifiers;

CREATE POLICY "Only super admin can manage modifiers"
ON public.dashboard_view_modifiers
FOR ALL
USING (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@bigmart.ge')
WITH CHECK (lower(coalesce(auth.jwt() ->> 'email', '')) = 'info@bigmart.ge');

CREATE POLICY "Users can read own modifier"
ON public.dashboard_view_modifiers
FOR SELECT
USING (lower(target_email) = lower(coalesce(auth.jwt() ->> 'email', '')));