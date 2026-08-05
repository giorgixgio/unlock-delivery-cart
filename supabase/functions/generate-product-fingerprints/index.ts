// generate-product-fingerprints
// One-time backfill of products.visual_fingerprint using AI vision.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function stripFences(s: string) {
  return s.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function callVisionJSON(prompt: string, imageUrls: string[]): Promise<any> {
  const content: any[] = [{ type: "text", text: prompt }];
  for (const url of imageUrls) content.push({ type: "image_url", image_url: { url } });

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }], temperature: 0.2 }),
  });
  if (!resp.ok) throw new Error(`AI error: ${await resp.text()}`);
  const data = await resp.json();
  const raw = stripFences(data.choices?.[0]?.message?.content ?? "{}");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Gemini only accepts PNG/JPEG/WebP/GIF by URL; transcode Supabase Storage objects, drop the rest.
const SUPPORTED_IMG = /\.(png|jpe?g|webp|gif)(\?|$)/i;
function toVisionUrl(url: string): string | null {
  if (!url) return null;
  if (SUPPORTED_IMG.test(url)) return url;
  if (url.includes("/storage/v1/object/")) {
    const transformed = url.replace("/storage/v1/object/", "/storage/v1/render/image/");
    return transformed + (transformed.includes("?") ? "&" : "?") + "width=800&quality=80";
  }
  return null;
}

function refImages(p: any): string[] {
  const raw: string[] = [];
  if (p.image) raw.push(p.image);
  if (Array.isArray(p.images)) {
    for (const img of p.images) {
      if (img && !raw.includes(img)) raw.push(img);
    }
  }
  return raw
    .filter((u) => /^https?:\/\//i.test(String(u)))
    .map(toVisionUrl)
    .filter((u): u is string => !!u)
    .slice(0, 2);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

const PROMPT = `Describe this product for a visual similarity index. Respond ONLY with JSON: {"fingerprint": "category, shape, primary colors, material, 2-3 distinguishing visual features — concise, comma separated, max 30 words"}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let limit = 20;
    try {
      const body = await req.json();
      if (body && Number.isFinite(Number(body.limit))) limit = Math.max(1, Math.min(200, Number(body.limit)));
    } catch { /* default */ }

    const { data: products, error } = await supabase
      .from("products")
      .select("id, sku, title, description, image, images")
      .is("fingerprint_generated_at", null)
      .limit(limit);
    if (error) return json(500, { error: error.message });

    let processed = 0;
    await mapLimit(products || [], 6, async (p: any) => {
      try {
        const refs = refImages(p);
        let fingerprint: string | null = null;
        if (refs.length) {
          const out = await callVisionJSON(PROMPT, refs);
          const fp = typeof out.fingerprint === "string" ? out.fingerprint.trim() : "";
          fingerprint = fp || null;
        }
        await supabase
          .from("products")
          .update({ visual_fingerprint: fingerprint, fingerprint_generated_at: new Date().toISOString() })
          .eq("id", p.id);
        processed++;
      } catch (err) {
        console.error("fingerprint error for", p?.sku, err);
      }
    });

    const { count: remaining } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .is("fingerprint_generated_at", null);

    return json(200, { processed, remaining: remaining ?? 0 });
  } catch (e) {
    console.error("generate-product-fingerprints error:", e);
    return json(500, { error: String(e) });
  }
});
