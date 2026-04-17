-- 1. Restore admin login for everyone (revert hardcoded lado exclusion)
CREATE OR REPLACE FUNCTION public.is_active_admin(user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE lower(au.email) = lower((SELECT email FROM auth.users WHERE id = user_id))
      AND au.is_active = true
  );
$$;

-- 2. Add is_demo flag on admin_users for opt-in demo mode
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

-- 3. Mark lado@bigmart.ge as demo so they only see zeros
UPDATE public.admin_users
  SET is_demo = true
  WHERE lower(email) = 'lado@bigmart.ge';

-- 4. Allow any authenticated user to read their own admin row (so client can detect demo flag)
DROP POLICY IF EXISTS "Users can read own admin row" ON public.admin_users;
CREATE POLICY "Users can read own admin row"
  ON public.admin_users
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid())));