import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const email = "lado@bigmart.ge";
  const password = "lado1331";

  // Find or create the auth user
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email?.toLowerCase() === email);

  if (!user) {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
    user = created.user!;
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, { password });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
  }

  // Ensure admin_users row exists and is active
  const { error: upsertErr } = await admin
    .from("admin_users")
    .upsert({ email, is_active: true, role: "operator" }, { onConflict: "email" });

  if (upsertErr) {
    return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500 });
  }

  return new Response(
    JSON.stringify({ ok: true, userId: user.id, email }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
