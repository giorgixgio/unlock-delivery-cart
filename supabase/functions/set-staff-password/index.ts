// set-staff-password — super-admin-only password reset for staff accounts.
// Caller must present a valid JWT belonging to info@bigmart.ge.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPER_ADMIN = "info@bigmart.ge";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    // Identify the caller with their own JWT (never sign in on the service client).
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    const callerEmail = userData?.user?.email?.toLowerCase() ?? null;
    if (userErr || !callerEmail) return json({ error: "Unauthorized" }, 401);
    if (callerEmail !== SUPER_ADMIN) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email) return json({ error: "email is required" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Only allow resetting accounts that exist in admin_users (staff accounts).
    const { data: staffRow } = await admin
      .from("admin_users")
      .select("email")
      .ilike("email", email)
      .maybeSingle();
    if (!staffRow) return json({ error: "Not a staff account" }, 400);

    // Locate the auth user by email.
    let targetId: string | null = null;
    for (let page = 1; page <= 20 && !targetId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (hit) targetId = hit.id;
      if (data.users.length < 200) break;
    }

    if (!targetId) {
      const { error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr) return json({ error: createErr.message }, 500);
      return json({ ok: true, created: true });
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password });
    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true, created: false });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
