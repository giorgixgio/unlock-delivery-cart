import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { proxyFetch } from "../_shared/proxyFetch.ts";
import { parseRegions, cityKey } from "../_shared/onwayRegions.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !service || !anon) return json({ error: "Configuration missing" }, 500);
  const auth = req.headers.get("Authorization") || "";
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);
  const db = createClient(url, service);
  const { data: admin } = await db.rpc("is_active_admin", { user_id: user.id });
  if (!admin) return json({ error: "Forbidden" }, 403);
  try {
    const username = Deno.env.get("ONWAY_API_USERNAME"), key = Deno.env.get("ONWAY_API_KEY");
    if (!username || !key) return json({ error: "Onway credentials missing" }, 500);
    let raw = "", status: number | null = null;
    try {
      const reply = await proxyFetch("https://onway.ge/index.php?route=api/order/regions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, key }), signal: AbortSignal.timeout(20000) });
      status = reply.status;
      raw = await reply.text();
    } catch { raw = "Proxy request failed or timed out"; }
    // Redact credentials even if the provider echoes the submitted request.
    raw = raw.split(key).join("***").split(username).join("***");
    const { error: logError } = await db.from("onway_api_log").insert({ endpoint: "api/order/regions", request_masked: { username: "***", key: "***" }, http_status: status, response_raw: raw, created_by: user.email || user.id });
    if (logError) return json({ error: "Could not preserve regions response" }, 500);
    if (!status || status < 200 || status >= 300) return json({ error: "Onway regions request failed", http_status: status }, 502);
    let regions;
    try { regions = parseRegions(raw); } catch { return json({ error: "Onway returned unreadable regions; existing cache kept" }, 502); }
    if (!regions.length) return json({ error: "No identifiable regions returned; existing cache kept" }, 502);
    const now = new Date().toISOString();
    const { error } = await db.from("onway_regions").upsert(regions.map(r => ({ ...r, active: true, refreshed_at: now })));
    if (error) throw new Error("Could not save regions");
    const { error: retireError } = await db.from("onway_regions").update({ active: false }).lt("refreshed_at", now);
    if (retireError) throw new Error("Could not retire old regions");
    const { data: aliases } = await db.from("city_aliases").select("alias_normalized,canonical_city");
    const candidates = [...regions.map(r => ({ alias_normalized: r.name, canonical_city: r.name })), ...(aliases || [])];
    const byName = new Map<string, Set<string>>();
    for (const r of regions) for (const name of [r.name, r.name.split(">").at(-1)]) {
      const k = cityKey(name);
      const ids = byName.get(k) || new Set<string>(); ids.add(r.id); byName.set(k, ids);
    }
    const maps = new Map<string, { alias: string; region_id: string; refreshed_at: string }>();
    for (const a of candidates) {
      const ids = byName.get(cityKey(a.canonical_city));
      const regionId = ids?.size === 1 ? [...ids][0] : null;
      if (regionId) maps.set(cityKey(a.alias_normalized), { alias: cityKey(a.alias_normalized), region_id: regionId, refreshed_at: now });
    }
    if (maps.size) {
      const { error: mapError } = await db.from("onway_region_aliases").upsert([...maps.values()]);
      if (mapError) throw new Error("Could not save city mappings");
    }
    await db.from("onway_region_aliases").delete().lt("refreshed_at", now);
    return json({ count: regions.length, sample: regions.slice(0, 10).map(r => ({ id: r.id, name: r.name })), mapped_aliases: maps.size });
  } catch { return json({ error: "Regions refresh failed; inspect the stored response" }, 500); }
});