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
      AND lower(au.email) <> 'lado@bigmart.ge'
  );
$$;