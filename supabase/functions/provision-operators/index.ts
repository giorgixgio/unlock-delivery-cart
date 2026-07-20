// One-time provisioning: create Eto & Mariam operator accounts,
// reset the main account password, and register them in admin_users.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Account {
  email: string;
  password: string;
  role: string;
}

const ACCOUNTS: Account[] = [
  { email: "info@bigmart.ge", password: "OQZdbjYP6UG02Q", role: "admin" },
  { email: "eto@bigmart.ge", password: "qzVLXHonrFFZP0", role: "operator" },
  { email: "mariam@bigmart.ge", password: "RS7FhZm5GCp0s1", role: "operator" },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: any[] = [];

  for (const acc of ACCOUNTS) {
    try {
      // Try to find existing user
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = list?.users?.find(
        (u) => (u.email || "").toLowerCase() === acc.email.toLowerCase()
      );

      let userId: string;
      if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, {
          password: acc.password,
          email_confirm: true,
        });
        if (error) throw error;
        userId = existing.id;
        results.push({ email: acc.email, action: "password_updated" });
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: acc.email,
          password: acc.password,
          email_confirm: true,
        });
        if (error) throw error;
        userId = data.user!.id;
        results.push({ email: acc.email, action: "created" });
      }

      // Upsert into admin_users
      const { data: row } = await admin
        .from("admin_users")
        .select("id")
        .eq("email", acc.email.toLowerCase())
        .maybeSingle();

      if (row) {
        await admin
          .from("admin_users")
          .update({ role: acc.role, is_active: true })
          .eq("id", (row as any).id);
      } else {
        await admin.from("admin_users").insert({
          email: acc.email.toLowerCase(),
          role: acc.role,
          is_active: true,
        });
      }
    } catch (e: any) {
      results.push({ email: acc.email, error: e.message });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
