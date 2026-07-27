// One-time provisioning: create the warehouse (products-only) account
// and register it in admin_users with role='warehouse'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL = "warehouse@bigmart.ge";
const PASSWORD = "Wh4reH0use!Br7pQ";
const ROLE = "warehouse";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const result: any = { email: EMAIL, role: ROLE };
  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find(
      (u) => (u.email || "").toLowerCase() === EMAIL.toLowerCase()
    );

    let userId: string;
    if (existing) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userId = existing.id;
      result.action = "password_updated";
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
      });
      if (error) throw error;
      userId = data.user!.id;
      result.action = "created";
    }

    const { data: row } = await admin
      .from("admin_users")
      .select("id")
      .eq("email", EMAIL.toLowerCase())
      .maybeSingle();

    if (row) {
      await admin
        .from("admin_users")
        .update({ role: ROLE, is_active: true })
        .eq("id", (row as any).id);
    } else {
      await admin.from("admin_users").insert({
        email: EMAIL.toLowerCase(),
        role: ROLE,
        is_active: true,
      });
    }
  } catch (e: any) {
    result.error = e.message;
  }

  return new Response(JSON.stringify({ ok: true, result, password: PASSWORD }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
