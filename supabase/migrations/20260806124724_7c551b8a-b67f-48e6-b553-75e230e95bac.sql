DROP POLICY IF EXISTS "Users can read own admin row" ON public.admin_users;
CREATE POLICY "Users can read own admin row"
ON public.admin_users
FOR SELECT
TO authenticated
USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));