import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORY_IDS = [
  "სამზარეულო",
  "სახლი-ინტერიერი",
  "თავის-მოვლა-სილამაზე",
  "ხელსაწყოები",
  "ავტომობილი",
  "ბავშვები",
  "სპორტი-აქტიური-ცხოვრება",
  "აბაზანა-სანტექნიკა",
  "განათება",
  "ბაღი-ეზო",
  "ელექტრონიკა-გაჯეტები",
  "აქსესუარები",
  "ცხოველები",
  "კემპინგი-ტურიზმი",
  "უსაფრთხოება-სპეცტანსაცმელი",
  "ჩანთები-ორგანაიზერები",
  "თამბაქოს-აქსესუარები",
  "uncategorized",
];

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3.1-flash-lite";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) return json({ success: false, error: "Missing LOVABLE_API_KEY" }, 500);

    // Admin auth
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ success: false, error: "Unauthorized" }, 401);
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) return json({ success: false, error: "Unauthorized" }, 401);

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await supabase.rpc("is_active_admin", { user_id: userData.user.id });
    if (!isAdmin) return json({ success: false, error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 200);
    const onlyUncategorized = body.only_uncategorized !== false;

    let query = supabase
      .from("products")
      .select("id, title, tags, image, category")
      .order("title")
      .limit(limit);
    if (onlyUncategorized) query = query.eq("category", "uncategorized");
    const { data: products, error } = await query;
    if (error) return json({ success: false, error: error.message }, 500);
    if (!products || products.length === 0) return json({ success: true, processed: 0, assigned: 0 });

    let assigned = 0;
    let processed = 0;
    const failures: string[] = [];

    for (const p of products) {
      const content: unknown[] = [
        {
          type: "text",
          text:
            `Classify this e-commerce product into 1-3 of the allowed category ids.\n` +
            `Allowed ids (use EXACTLY these strings): ${CATEGORY_IDS.join(", ")}\n` +
            `Product title (Georgian): ${p.title}\n` +
            `Tags: ${(p.tags || []).join(", ") || "none"}\n` +
            `Respond ONLY with JSON: {"categories":[{"id":"<allowed id>","confidence":0.0-1.0}]} ordered most relevant first. Use "uncategorized" only if nothing fits.`,
        },
      ];
      if (p.image && /^https?:\/\//.test(p.image)) {
        content.push({ type: "image_url", image_url: { url: p.image } });
      }

      const res = await fetch(AI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": lovableApiKey,
          "X-Lovable-AIG-SDK": "fetch",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content }],
          response_format: { type: "json_object" },
        }),
      });

      if (res.status === 429) return json({ success: false, error: "Rate limited, try again later", processed, assigned }, 429);
      if (res.status === 402) return json({ success: false, error: "AI credits exhausted", processed, assigned }, 402);
      if (!res.ok) {
        failures.push(`${p.id}: ${res.status} ${(await res.text()).slice(0, 160)}`);
        continue;
      }

      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content ?? "{}";
      let parsed: { categories?: Array<{ id?: string; confidence?: number }> } = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        failures.push(`${p.id}: unparseable response`);
        continue;
      }

      const picks = (parsed.categories || [])
        .filter((c) => c?.id && CATEGORY_IDS.includes(c.id) && c.id !== "uncategorized")
        .slice(0, 3);
      processed++;
      if (picks.length === 0) continue;

      const rows = picks.map((c, idx) => ({
        product_id: p.id,
        category: c.id as string,
        is_primary: idx === 0,
        source: "ai",
        confidence: typeof c.confidence === "number" ? c.confidence : null,
      }));

      const { error: upErr } = await supabase
        .from("product_categories")
        .upsert(rows, { onConflict: "product_id,category" });
      if (upErr) {
        failures.push(`${p.id}: ${upErr.message}`);
        continue;
      }
      assigned += rows.length;

      // Keep the legacy single category column in sync with the primary pick
      if (p.category === "uncategorized") {
        await supabase.from("products").update({ category: rows[0].category }).eq("id", p.id);
      }
    }

    return json({ success: true, processed, assigned, failures: failures.slice(0, 20) });
  } catch (err) {
    console.error("classify-product-categories error:", err);
    return json({ success: false, error: (err as Error).message }, 500);
  }
});
