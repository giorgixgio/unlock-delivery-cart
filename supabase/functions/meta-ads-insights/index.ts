// Meta Ads Insights — per-ad spend/purchases pulled from the Meta connector
// gateway and aggregated per SKU code extracted from ad names.
// Body: { since: "YYYY-MM-DD", until: "YYYY-MM-DD" } (Tbilisi dates from the dashboard)
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, any>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const AD_ACCOUNT = "act_1368063587966686";
const GATEWAY = "https://connector-gateway.lovable.dev/meta_ads";

// Extract a SKU code from an ad name: "0012_keramiko" -> "0012",
// "G888-T4656-0019 ..." -> "0019", "0009_აბაზანის" -> "0009".
function skuCodeFromAdName(name: string): string | null {
  const g = name.match(/G888-T\d+-(\d{3,4})/i);
  if (g) return g[1];
  const lead = name.match(/^0*(\d{3,4})[_\s-]/);
  if (lead) return lead[1].padStart(4, "0");
  return null;
}

function purchasesFrom(actions: any[] | undefined): number {
  if (!Array.isArray(actions)) return 0;
  // "purchase" and "omni_purchase" report the SAME events — never sum both.
  const purchase = actions.find((a) => a?.action_type === "purchase");
  if (purchase) return Number(purchase.value) || 0;
  const omni = actions.find((a) => a?.action_type === "omni_purchase");
  return omni ? Number(omni.value) || 0 : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let stage = "auth";
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json(401, { success: false, message: "Unauthorized", details: { stage } });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const metaKey = Deno.env.get("META_ADS_API_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json(500, { success: false, message: "Server configuration error", details: { stage } });
    }
    if (!lovableKey || !metaKey) {
      return json(500, { success: false, message: "Meta connection is not linked to this project", details: { stage } });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const userEmail = userData?.user?.email?.trim().toLowerCase() ?? null;
    if (userErr || !userEmail) {
      return json(401, { success: false, message: "Unauthorized", details: { stage } });
    }
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: staffRow, error: staffErr } = await admin
      .from("admin_users")
      .select("is_active, role")
      .ilike("email", userEmail)
      .maybeSingle();
    const role = String(staffRow?.role ?? "").toLowerCase();
    if (staffErr || staffRow?.is_active !== true || role === "warehouse" || role === "scanner") {
      return json(403, { success: false, message: "Forbidden", details: { stage } });
    }

    stage = "parse_body";
    const body = await req.json().catch(() => ({}));
    const since = String(body?.since ?? "").slice(0, 10);
    const until = String(body?.until ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
      return json(400, { success: false, message: "since/until dates are required", details: { stage } });
    }

    stage = "meta_insights";
    const params = new URLSearchParams({
      level: "ad",
      fields: "ad_name,spend,impressions,clicks,actions",
      time_range: JSON.stringify({ since, until }),
      limit: "500",
    });
    let url = `${GATEWAY}/v26.0/${AD_ACCOUNT}/insights?${params.toString()}`;
    const rows: any[] = [];
    for (let page = 0; page < 20 && url; page++) {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": metaKey,
        },
      });
      const text = await res.text();
      if (!res.ok) {
        console.error(`[meta-ads-insights] gateway failed [${res.status}]: ${text}`);
        return json(res.status, { success: false, message: "Meta request failed", details: { stage, status: res.status, body: text.slice(0, 500) } });
      }
      const data = JSON.parse(text);
      rows.push(...(data?.data ?? []));
      url = data?.paging?.next ?? null;
    }

    stage = "aggregate";
    const bySku = new Map<string, { skuCode: string; spend: number; purchases: number; clicks: number; impressions: number; ads: number }>();
    let unmatchedSpend = 0;
    let unmatchedAds = 0;
    for (const r of rows) {
      const code = skuCodeFromAdName(String(r.ad_name ?? ""));
      const spend = Number(r.spend) || 0;
      if (!code) {
        unmatchedSpend += spend;
        unmatchedAds++;
        continue;
      }
      const cur = bySku.get(code) ?? { skuCode: code, spend: 0, purchases: 0, clicks: 0, impressions: 0, ads: 0 };
      cur.spend += spend;
      cur.purchases += purchasesFrom(r.actions);
      cur.clicks += Number(r.clicks) || 0;
      cur.impressions += Number(r.impressions) || 0;
      cur.ads++;
      bySku.set(code, cur);
    }
    const items = [...bySku.values()]
      .map((x) => ({ ...x, spend: Math.round(x.spend * 100) / 100, cpa: x.purchases > 0 ? Math.round((x.spend / x.purchases) * 100) / 100 : null }))
      .sort((a, b) => b.spend - a.spend);

    return json(200, {
      success: true,
      since,
      until,
      items,
      unmatched: { ads: unmatchedAds, spend: Math.round(unmatchedSpend * 100) / 100 },
      totalAds: rows.length,
    });
  } catch (e) {
    console.error("[meta-ads-insights] error", { stage, error: String(e) });
    return json(500, { success: false, message: "Internal error", details: { stage, error: String(e) } });
  }
});
