// Pauses Meta ad sets once their SKU's ordered quantity (all leads, excl. merged/returns)
// since count_from reaches cap_qty. Run by pg_cron every 2 minutes.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const GATEWAY = "https://connector-gateway.lovable.dev/meta_ads";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const metaKey = Deno.env.get("META_ADS_API_KEY");
  const results: any[] = [];
  const { data: caps, error } = await db.from("meta_adset_caps").select("*").eq("is_enabled", true).is("paused_at", null);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  for (const c of caps ?? []) {
    let qty = 0;
    for (let from = 0; ; from += 1000) {
      const { data: rows, error: e } = await db.from("order_items")
        .select("quantity, orders!inner(created_at,status,is_return)")
        .eq("sku", c.sku)
        .gte("orders.created_at", c.count_from)
        .neq("orders.status", "merged")
        .eq("orders.is_return", false)
        .range(from, from + 999);
      if (e) { results.push({ sku: c.sku, error: e.message }); break; }
      qty += (rows ?? []).reduce((s: number, r: any) => s + (Number(r.quantity) || 0), 0);
      if (!rows || rows.length < 1000) break;
    }
    const upd: Record<string, unknown> = { last_qty: qty, last_checked_at: new Date().toISOString(), last_error: null };
    if (qty >= c.cap_qty) {
      const res = await fetch(`${GATEWAY}/v26.0/${c.adset_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": metaKey!, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });
      const text = await res.text();
      if (res.ok) upd.paused_at = new Date().toISOString();
      else { upd.last_error = `[${res.status}] ${text.slice(0, 400)}`; console.error("pause failed", c.adset_name, res.status, text); }
    }
    await db.from("meta_adset_caps").update(upd).eq("adset_id", c.adset_id);
    results.push({ adset: c.adset_name, qty, cap: c.cap_qty, paused: !!upd.paused_at });
  }
  return new Response(JSON.stringify({ results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
