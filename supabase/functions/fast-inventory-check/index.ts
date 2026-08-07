// fast-inventory-check
// --------------------------------------------------------------
// Fast warehouse bin-verification for packers.
//
// action=confirm { sku, position, actor }
//   Packer visually confirms the product at `position` IS the typed SKU.
//   Sets products.bin_location = position and records a confirmed scan.
//
// action=reject  { sku, position, photo_url, actor }
//   Packer says the item at `position` is NOT that SKU. Frees the SKU on the
//   product currently holding it, queues an unidentified_items row, responds
//   immediately, and fingerprint-matches the photo in the background.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const MODEL = "google/gemini-2.5-flash";

// Same prompt as generate-product-fingerprints / scan-product, so the photo is
// described in the same "language" as the stored visual_fingerprint column.
const FINGERPRINT_PROMPT = `Describe this product for a visual similarity index. Respond ONLY with JSON: {"fingerprint": "category, shape, primary colors, material, 2-3 distinguishing visual features — concise, comma separated, max 30 words"}`;

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
    .slice(0, 4);
}

async function compareToProduct(product: any, photoUrl: string) {
  const refs = refImages(product);
  const refLabel = refs.length > 1
    ? `Images 1-${refs.length} are REFERENCE catalog photos (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)`
    : `Image 1 is a REFERENCE catalog photo (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)`;
  const lastLabel = `Image ${refs.length + 1}`;
  const prompt = `You are verifying warehouse inventory for an e-commerce store.

IMPORTANT CONTEXT: This is a generic/white-label product catalog. The same physical item is frequently resold across different supplier batches under different printed brand names, logos, or packaging text/color — the box or sleeve is not a reliable identity signal on its own.

${refLabel} for product "${product.title}" (SKU ${product.sku}). Description: ${(product.description || "").slice(0, 300)}
${lastLabel} is a photo a warehouse worker just took of the physical product itself (unboxed).

Work in this order, actually LOOKING at the pixels, and keep two categories SEPARATE:
(1) THE PHYSICAL ITEM — overall shape/form factor, size and proportions, material or texture, functional design (buttons, ports, moving parts), and the actual color of the item itself (not the packaging color).
(2) PACKAGING / BRANDING — printed logo, brand name, box or sleeve color and printed text.

1. Name 2-4 specific features of category (1) for the reference image(s), then separately note category (2).
2. Name the same for the worker's photo.
3. State, feature by feature, whether each matches.

Scoring rules:
- Base the match PRIMARILY on category (1), the physical item.
- If the physical item's shape/material/functional design clearly match, do NOT reject the match solely because of different logos, brand names, or packaging text/color. Packaging differences alone must NOT drag confidence below a moderate score (~60).
- Packaging counts as negative evidence only when it is the sole basis — i.e. the physical item itself also looks uncertain.
- confidence 70+ ONLY if MULTIPLE specific physical features (not just category) clearly match.
- Generic resemblance ("both are power banks", "both are black gadgets") with no specific matching physical features must score well under 40.
- Ignore background, lighting, staging, and photo angle — the reference is a generic supplier photo, not a warehouse photo.

Respond ONLY with JSON, no markdown:
{"features_compared": "physical: <shape/material/design/color match or not> | packaging: <branding differs or matches, and whether it was counted against the match>", "match": true or false, "confidence": 0-100, "reasoning": "short phrase, max 12 words"}`;
  if (refs.length === 0) return { match: false, confidence: 0, reasoning: "No usable reference photo (invalid image URL on file)", features_compared: "", refs: [] as string[] };
  const out = await callVisionJSON(prompt, [...refs, photoUrl]);
  return {
    match: !!out.match,
    confidence: typeof out.confidence === "number" ? out.confidence : 0,
    reasoning: out.reasoning || "",
    features_compared: typeof out.features_compared === "string" ? out.features_compared : "",
    refs,
  };
}

// Fingerprint the worker photo and vision-rank the nearest catalog products.
async function searchCatalogCandidates(supabase: any, photoUrl: string) {
  let fingerprint = "";
  const fpOut = await callVisionJSON(FINGERPRINT_PROMPT, [photoUrl]);
  fingerprint = typeof fpOut.fingerprint === "string" ? fpOut.fingerprint.trim() : "";
  if (!fingerprint) return [];

  const { data: matches, error: matchErr } = await supabase.rpc("match_products_by_fingerprint", {
    query_fp: fingerprint,
    exclude_id: null,
    match_limit: 10,
  });
  if (matchErr) throw new Error(matchErr.message);

  const pool = (matches || []).slice(0, 10);
  const checked = await mapLimit(pool, 6, async (p: any) => {
    try {
      const r = await compareToProduct(p, photoUrl);
      return { product: p, ...r };
    } catch (err) {
      console.error("compareToProduct candidate error:", p?.sku, err);
      return { product: p, match: false, confidence: 0, reasoning: "Vision check failed", features_compared: "" };
    }
  });

  return checked
    .sort((a: any, b: any) => b.confidence - a.confidence)
    .slice(0, 5)
    .map((c: any) => ({
      id: c.product.id,
      sku: c.product.sku,
      title: c.product.title,
      image: refImages(c.product)[0] || c.product.image || null,
      confidence: c.confidence,
    }));
}

async function fingerprintInBackground(supabase: any, itemId: string, photoUrl: string) {
  try {
    const candidates = await searchCatalogCandidates(supabase, photoUrl);
    await supabase
      .from("unidentified_items")
      .update({ fingerprint_candidates: candidates, fingerprint_status: "done" })
      .eq("id", itemId);
  } catch (err) {
    console.error("background fingerprint failed:", err);
    try {
      await supabase.from("unidentified_items").update({ fingerprint_status: "failed" }).eq("id", itemId);
    } catch (e) {
      console.error("failed to mark fingerprint_status=failed:", e);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const action = String(body.action || "");

    // ── CONFIRM ────────────────────────────────────────────────
    if (action === "confirm") {
      const { sku, position, actor } = body;
      if (!sku || !position) return json(400, { error: "sku and position required" });

      const { data: products, error: lookupErr } = await supabase
        .from("products")
        .select("id, sku, title, image")
        .eq("sku", String(sku).trim())
        .order("id", { ascending: true });
      if (lookupErr) return json(500, { error: lookupErr.message });

      if ((products?.length ?? 0) > 1) {
        return json(200, {
          status: "duplicate",
          products: products!.map((p: any) => ({ id: p.id, sku: p.sku, title: p.title, image: p.image || null })),
        });
      }

      const product = products?.[0];
      if (!product) {
        return json(404, { error: `SKU ${sku} not found in catalog — use Reject instead.`, code: "sku_not_found" });
      }

      const { error: prodErr } = await supabase
        .from("products")
        .update({ bin_location: String(position) })
        .eq("id", product.id);
      if (prodErr) return json(500, { error: prodErr.message });

      const { error: histErr } = await supabase
        .from("product_scan_history")
        .upsert({
          actor: actor ?? null,
          typed_sku: String(sku).trim(),
          position: String(position),
          photo_url: "",
          status: "confirmed",
          confirmed_product_id: product.id,
          corrected_sku: product.sku,
        }, { onConflict: "typed_sku" });
      if (histErr) return json(500, { error: histErr.message });

      return json(200, { ok: true });
    }

    // ── RESOLVE DUPLICATE ──────────────────────────────────────
    if (action === "resolve_duplicate") {
      const { sku, position, winner_product_id, loser_product_id, actor } = body;
      if (!sku || !position || !winner_product_id || !loser_product_id) {
        return json(400, { error: "sku, position, winner_product_id and loser_product_id required" });
      }

      const { data: skuRows, error: skuErr } = await supabase
        .from("products")
        .select("sku")
        .not("sku", "is", null);
      if (skuErr) return json(500, { error: skuErr.message });

      let maxNum = 0;
      for (const r of skuRows || []) {
        const s = String(r.sku ?? "").trim();
        if (/^\d+$/.test(s)) maxNum = Math.max(maxNum, parseInt(s, 10));
      }
      const newSku = String(maxNum + 1);

      const { data: pair, error: pairErr } = await supabase
        .from("products")
        .select("id, title")
        .in("id", [winner_product_id, loser_product_id]);
      if (pairErr) return json(500, { error: pairErr.message });
      const winnerTitle = pair?.find((p: any) => p.id === winner_product_id)?.title ?? winner_product_id;
      const loserTitle = pair?.find((p: any) => p.id === loser_product_id)?.title ?? loser_product_id;

      const { error: loserErr } = await supabase
        .from("products")
        .update({ sku: newSku, bin_location: newSku })
        .eq("id", loser_product_id);
      if (loserErr) return json(500, { error: loserErr.message });

      const { error: winErr } = await supabase
        .from("products")
        .update({ bin_location: String(position) })
        .eq("id", winner_product_id);
      if (winErr) return json(500, { error: winErr.message });

      const { error: histErr } = await supabase
        .from("product_scan_history")
        .upsert({
          actor: actor ?? null,
          typed_sku: String(sku).trim(),
          position: String(position),
          photo_url: "",
          status: "confirmed",
          confirmed_product_id: winner_product_id,
          corrected_sku: String(sku).trim(),
          notes: `Duplicate SKU resolved via Fast Check: kept ${String(sku).trim()} for ${winnerTitle}; reassigned ${loserTitle} to ${newSku}`,
        }, { onConflict: "typed_sku" });
      if (histErr) return json(500, { error: histErr.message });

      return json(200, { ok: true, new_sku: newSku, loser_title: loserTitle });
    }


    // ── REJECT ─────────────────────────────────────────────────
    if (action === "reject") {
      const { sku, position, photo_url, actor } = body;
      if (!sku || !position || !photo_url) return json(400, { error: "sku, position and photo_url required" });

      // The packer confirmed this product is NOT physically here → free the SKU.
      const { data: holders } = await supabase
        .from("products")
        .select("id")
        .ilike("sku", String(sku).trim());
      for (const h of holders || []) {
        const { error: freeErr } = await supabase
          .from("products")
          .update({ sku: null, bin_location: null })
          .eq("id", h.id);
        if (freeErr) console.error("failed to free sku on product", h.id, freeErr.message);
      }

      const { data: item, error: insErr } = await supabase
        .from("unidentified_items")
        .insert({
          typed_sku: String(sku).trim(),
          position: String(position),
          photo_url: String(photo_url),
          actor: actor ?? null,
          status: "pending",
          fingerprint_status: "pending",
        })
        .select("id")
        .single();
      if (insErr) return json(500, { error: insErr.message });

      const visionUrl = toVisionUrl(String(photo_url)) || String(photo_url);
      const task = fingerprintInBackground(supabase, item.id, visionUrl);
      // Keep the worker alive for the background task without blocking the response.
      // @ts-ignore EdgeRuntime is provided by the Supabase edge runtime
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(task);

      return json(200, { ok: true, item_id: item.id });
    }

    return json(400, { error: `unknown action: ${action}` });
  } catch (err) {
    console.error("fast-inventory-check error:", err);
    return json(500, { error: String(err) });
  }
});
