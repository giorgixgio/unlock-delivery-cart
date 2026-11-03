// onway-status-pull — admin-only backfill: rebuilds courier_shipments/history for API shipments
// from the newest stored webhook payload per tracking, through the same write path as the webhook.
// (A per-tracking pull from Onway's API will be added here once the endpoint/hash format is confirmed.)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { upsertOnwayShipment } from "../_shared/courierApiUpsert.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  const given = req.headers.get("x-cron-secret");
  let allowed = false;
  if (given) {
    const { data: s } = await db.from("internal_job_secrets").select("value").eq("name", "onway_status_pull").maybeSingle();
    allowed = !!s?.value && s.value === given;
  }
  if (!allowed) {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const { data: claims } = await createClient(url, anon, { global: { headers: { Authorization: auth } } }).auth.getClaims(auth.slice(7));
    const uid = claims?.claims?.sub;
    const { data: isAdmin } = uid ? await db.rpc("is_active_admin", { user_id: uid }) : { data: false };
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
  }

  // Newest payload per tracking, oldest first so newer-wins ordering holds.
  const { data: logs, error } = await db.from("onway_webhook_log").select("id, received_at, body_json")
    .not("body_json", "is", null).order("received_at", { ascending: false }).limit(5000);
  if (error) return json({ error: error.message }, 500);
  const latest = new Map<string, any>();
  for (const l of logs || []) {
    const t = String((l as any).body_json?.order_info?.trackingnumber ?? "").trim();
    if (t && !latest.has(t)) latest.set(t, l);
  }
  const counts: Record<string, number> = {};
  let historyAdded = 0, failed = 0;
  for (const l of [...latest.values()].reverse()) {
    try {
      const r = await upsertOnwayShipment(db, l.body_json);
      counts[r.result] = (counts[r.result] || 0) + 1;
      historyAdded += Number((r as any).history_added || 0);
    } catch (e) { failed++; console.error("onway-status-pull", e instanceof Error ? e.message : e); }
  }
  return json({ ok: true, trackings: latest.size, results: counts, history_added: historyAdded, failed });
});
