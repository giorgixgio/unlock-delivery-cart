// Silent data collection: logs the customer's IP-based city for an order.
// Never visible to customers or operators; failures are logged and ignored.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const UUID = /^[0-9a-f-]{36}$/i;

function clientIp(req: Request): string | null {
  const h = req.headers;
  const v = h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0];
  return v?.trim() || null;
}

async function fetchJson(url: string, ms = 3000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function lookup(ip: string) {
  try {
    const d = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json`);
    if (d?.bogon) throw new Error("bogon");
    return { provider: "ipinfo.io", geo_city: d.city ?? null, geo_region: d.region ?? null, geo_country: d.country ?? null,
      isp_org: d.org ? String(d.org).replace(/^AS\d+\s+/, "") : null, is_mobile: null as boolean | null };
  } catch (e1) {
    const d = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (d?.success === false) throw new Error(`ipinfo: ${e1}; ipwho: ${d.message}`);
    return { provider: "ipwho.is", geo_city: d.city ?? null, geo_region: d.region ?? null, geo_country: d.country_code ?? null,
      isp_org: d.connection?.isp || d.connection?.org || null, is_mobile: null as boolean | null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const ok = () => new Response("{}", { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const { order_id } = await req.json().catch(() => ({}));
    if (typeof order_id !== "string" || !UUID.test(order_id)) return ok();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Only fresh orders (just created by this visitor) can be logged.
    const { data: order } = await supabase.from("orders").select("id, created_at").eq("id", order_id).maybeSingle();
    if (!order || Date.now() - new Date(order.created_at).getTime() > 10 * 60 * 1000) return ok();

    const ip = clientIp(req);
    let row: Record<string, unknown> = { order_id, ip };
    if (!ip) row = { ...row, lookup_status: "failed", error_message: "no ip header" };
    else {
      try { row = { ...row, ...(await lookup(ip)), lookup_status: "ok" }; }
      catch (e) { row = { ...row, lookup_status: "failed", error_message: String(e).slice(0, 300) }; }
    }
    await supabase.from("ip_geo_log").upsert(row, { onConflict: "order_id", ignoreDuplicates: true });
  } catch (e) {
    console.warn("ip-geo-log error", e);
  }
  return ok();
});
