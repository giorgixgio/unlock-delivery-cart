-- Drop restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Active admins can view admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Active admins can insert admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Active admins can update admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Active admins can delete admin_users" ON public.admin_users;

CREATE POLICY "Active admins can view admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (is_active_admin(auth.uid()));

CREATE POLICY "Active admins can insert admin_users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (is_active_admin(auth.uid()));

CREATE POLICY "Active admins can update admin_users"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (is_active_admin(auth.uid()));

CREATE POLICY "Active admins can delete admin_users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (is_active_admin(auth.uid()));