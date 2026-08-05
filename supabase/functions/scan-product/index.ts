// scan-product
// --------------------------------------------------------------
// Warehouse SKU verification via AI vision (Lovable AI Gateway / Gemini).
//
// action=check   { sku, position, photo_url, actor }
//   1. Look up the typed SKU's product. Compare its reference photo +
//      title/description against the worker's new photo -> confidence.
//   2. If confidence >= MATCH_THRESHOLD -> matched, done.
//   3. Otherwise, derive keywords from the new photo, text-search the
//      catalog for candidates, vision-check the shortlist in parallel,
//      return the top matches for the worker to pick from.
//
// action=confirm { scan_id, product_id, position, actor }
//   Writes bin_location on the chosen product, marks the scan confirmed.
//
// action=flag    { scan_id, notes }
//   Marks a scan as flagged for manual review (no product match).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";
const MATCH_THRESHOLD = 65; // lower bar: catalog refs are Temu/AliExpress supplier photos, not warehouse photos
const MAX_CANDIDATES_CHECKED = 12;

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

// Gemini only accepts PNG/JPEG/WebP/GIF by URL. Many catalog photos are .avif,
// which makes the gateway 400. Supabase Storage can transcode on the fly via the
// /render/image/ endpoint, so rewrite those; drop anything we can't convert.
const SUPPORTED_IMG = /\.(png|jpe?g|webp|gif)(\?|$)/i;
function toVisionUrl(url: string): string | null {
  if (!url) return null;
  if (SUPPORTED_IMG.test(url)) return url;
  // Supabase Storage object URL -> transformed (JPEG) URL
  if (url.includes("/storage/v1/object/")) {
    const transformed = url.replace("/storage/v1/object/", "/storage/v1/render/image/");
    return transformed + (transformed.includes("?") ? "&" : "?") + "width=800&quality=80";
  }
  return null;
}

// Run an async mapper over items with a bounded number of in-flight calls.
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

function refImages(p: any): string[] {
  const out: string[] = [];
  if (p.image) out.push(p.image);
  if (Array.isArray(p.images)) {
    for (const img of p.images) {
      if (img && !out.includes(img)) out.push(img);
    }
  }
  return out.map(toVisionUrl).filter((u): u is string => !!u).slice(0, 4);
}


async function compareToProduct(product: any, photoUrl: string) {
  const refs = refImages(product);
  const refLabel = refs.length > 1 ? `Images 1-${refs.length} are REFERENCE catalog photos (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)` : `Image 1 is a REFERENCE catalog photo (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)`;
  const lastLabel = `Image ${refs.length + 1}`;
  const prompt = `You are verifying warehouse inventory for an e-commerce store.
${refLabel} for product "${product.title}" (SKU ${product.sku}). Description: ${(product.description || "").slice(0, 300)}
${lastLabel} is a photo a warehouse worker just took of the physical product itself (unboxed).
Judge ONLY whether it's the same physical item/design — ignore differences in background, lighting, staging, or photo angle, since the reference is a generic supplier photo, not a warehouse photo.
Respond ONLY with JSON, no markdown: {"match": true or false, "confidence": 0-100, "reasoning": "short phrase, max 12 words"}`;
  if (refs.length === 0) return { match: false, confidence: 0, reasoning: "No reference photo on file" };
  const out = await callVisionJSON(prompt, [...refs, photoUrl]);
  return {
    match: !!out.match,
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    reasoning: out.reasoning || "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const action = String(body.action || "check");

    // ── CONFIRM ────────────────────────────────────────────────
    if (action === "confirm") {
      const { scan_id, product_id, position, actor } = body;
      if (!scan_id || !product_id || !position) return json(400, { error: "scan_id, product_id, position required" });

      const { error: prodErr } = await supabase.from("products").update({ bin_location: String(position) }).eq("id", product_id);
      if (prodErr) return json(500, { error: prodErr.message });

      const { error: scanErr } = await supabase
        .from("product_scan_history")
        .update({ confirmed_product_id: product_id, status: "confirmed", actor })
        .eq("id", scan_id);
      if (scanErr) return json(500, { error: scanErr.message });

      return json(200, { ok: true });
    }

    // ── FLAG ───────────────────────────────────────────────────
    if (action === "flag") {
      const { scan_id, notes } = body;
      if (!scan_id) return json(400, { error: "scan_id required" });
      const { error } = await supabase.from("product_scan_history").update({ status: "flagged", notes: notes || null }).eq("id", scan_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    // ── CHECK ──────────────────────────────────────────────────
    if (action === "check") {
      const { sku, position, actor } = body;
      if (!sku || !body.photo_url) return json(400, { error: "sku and photo_url required" });
      const photo_url = toVisionUrl(String(body.photo_url)) || String(body.photo_url);


      const { data: exact } = await supabase
        .from("products")
        .select("id, sku, title, description, image, images")
        .ilike("sku", String(sku).trim())
        .limit(1)
        .maybeSingle();

      let originalResult: { match: boolean; confidence: number; reasoning: string } | null = null;
      if (exact) {
        originalResult = await compareToProduct(exact, photo_url);
      }

      // ── High-confidence direct match: done.
      if (exact && originalResult && originalResult.confidence >= MATCH_THRESHOLD) {
        const { data: row } = await supabase
          .from("product_scan_history")
          .insert({
            actor, typed_sku: sku, position, photo_url,
            matched_product_id: exact.id, confidence: originalResult.confidence, status: "matched",
          })
          .select("id")
          .single();
        return json(200, {
          status: "matched",
          scan_id: row?.id,
          product: { id: exact.id, sku: exact.sku, title: exact.title },
          confidence: originalResult.confidence,
          reasoning: originalResult.reasoning,
        });
      }

      // ── Mismatch / not found: broader search.
      let keywords: string[] = [];
      try {
        const kwOut = await callVisionJSON(
          `Look at this photo of a physical product. Give 3-5 short keywords (English) describing what it is, for a catalog search. Respond ONLY with JSON: {"keywords": ["...", "..."]}`,
          [photo_url]
        );
        keywords = Array.isArray(kwOut.keywords) ? kwOut.keywords.map((k: string) => String(k).replace(/[^\w\s]/g, "").trim()).filter(Boolean) : [];
      } catch { /* fall through with no keywords */ }

      let candidateProducts: any[] = [];
      if (keywords.length) {
        const orParts = keywords.flatMap((k) => [`title.ilike.%${k}%`, `description.ilike.%${k}%`]).join(",");
        const { data: found } = await supabase
          .from("products")
          .select("id, sku, title, description, image, images")
          .or(orParts)
          .neq("id", exact?.id || "00000000-0000-0000-0000-000000000000")
          .limit(MAX_CANDIDATES_CHECKED);
        candidateProducts = found || [];
      }

      const checked = await Promise.all(
        candidateProducts.map(async (p) => {
          const r = await compareToProduct(p, photo_url);
          return { product: p, ...r };
        })
      );
      const ranked = checked
        .filter((c) => c.confidence > 0)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 5)
        .map((c) => ({ id: c.product.id, sku: c.product.sku, title: c.product.title, confidence: c.confidence }));

      const { data: row } = await supabase
        .from("product_scan_history")
        .insert({
          actor, typed_sku: sku, position, photo_url,
          matched_product_id: exact?.id || null,
          confidence: originalResult?.confidence ?? null,
          status: "mismatch",
          candidates: ranked,
        })
        .select("id")
        .single();

      return json(200, {
        status: "mismatch",
        scan_id: row?.id,
        typed_sku_found: !!exact,
        original: exact ? { product: { id: exact.id, sku: exact.sku, title: exact.title }, confidence: originalResult?.confidence ?? 0, reasoning: originalResult?.reasoning } : null,
        candidates: ranked,
      });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("scan-product error:", e);
    return json(500, { error: String(e) });
  }
});
