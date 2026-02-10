

## Admin Credentials Setup

### What will be done

1. **Seed the admin user record** in the `admin_users` table via a database migration:
   - Email: `info@bigmart.ge`
   - Role: `admin`
   - `is_active`: true
   - This bypasses RLS since migrations run with elevated privileges.

2. **Create the auth account** by temporarily adding a signup call in the admin login page (or using the Supabase auth API directly). Since the password `1234` is very short, I will use it as requested but note that it may be rejected by the auth system if minimum password length is enforced (default is 6 characters). If rejected, I will use `123456` instead.

3. **Sign-up approach**: Add a one-time utility or use an edge function to create the auth user with the provided credentials. The simplest approach is to call `supabase.auth.signUp()` from a small temporary script or directly seed it.

### Technical Steps

1. **Migration**: Insert row into `admin_users`
   ```sql
   INSERT INTO public.admin_users (email, role, is_active)
   VALUES ('info@bigmart.ge', 'admin', true);
   ```

2. **Edge function** `create-admin-user`: A one-time edge function that uses the service role key to create the auth user with `supabase.auth.admin.createUser()`. This ensures the user is created server-side with email confirmed. After use, this function can be removed.

3. **Credentials**:
   - Email: `info@bigmart.ge`
   - Password: `123456` (minimum 6 characters required by auth system; `1234` will be rejected)

### Security Note
- The edge function will be a one-time setup tool and should be deleted after the admin account is created.
- The password should be changed after first login (recommended).

