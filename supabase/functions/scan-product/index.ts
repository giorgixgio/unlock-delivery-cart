// scan-product
// --------------------------------------------------------------
// Warehouse SKU verification via AI vision (Lovable AI Gateway / Gemini).
//
// action=check   { sku, position, photo_url, actor }
//   1. Look up the typed SKU's product. Compare its reference photo +
//      title/description against the worker's new photo -> confidence.
//   2. If confidence >= MATCH_THRESHOLD -> matched, done.
//   3. Otherwise, fingerprint the new photo and use the trigram-indexed
//      match_products_by_fingerprint() RPC to shortlist 10 candidates,
//      vision-check them in parallel, return the top matches to pick from.
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

// Same prompt/format as generate-product-fingerprints, so the worker's photo is
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


// Probe a URL exactly as it will be sent to Gemini, so we can verify the model
// is actually receiving a real, loadable image.
async function probeImageUrl(url: string) {
  try {
    let resp = await fetch(url, { method: "HEAD" });
    if (!resp.ok || !resp.headers.get("content-type")) {
      resp = await fetch(url, { method: "GET" });
    }
    return {
      url,
      ok: resp.ok,
      status: resp.status,
      contentType: resp.headers.get("content-type"),
    };
  } catch (e) {
    return { url, ok: false, status: 0, contentType: null, error: String(e) };
  }
}

async function compareToProduct(product: any, photoUrl: string) {
  const refs = refImages(product);
  const refLabel = refs.length > 1 ? `Images 1-${refs.length} are REFERENCE catalog photos (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)` : `Image 1 is a REFERENCE catalog photo (from the supplier's listing — Temu/AliExpress style: may differ in background, lighting, staging, or angle from a real warehouse photo)`;
  const lastLabel = `Image ${refs.length + 1}`;
  const prompt = `You are verifying warehouse inventory for an e-commerce store.
${refLabel} for product "${product.title}" (SKU ${product.sku}). Description: ${(product.description || "").slice(0, 300)}
${lastLabel} is a photo a warehouse worker just took of the physical product itself (unboxed).

Work in this order, actually LOOKING at the pixels:
1. Name 2-4 SPECIFIC distinguishing visual features of the item in the reference image(s): overall shape/form factor, exact colors and where they appear, distinctive markings/text/logos/buttons/ports, material or texture.
2. Name the same kind of specific features for the worker's photo.
3. State explicitly, feature by feature, whether each one matches.

Scoring rules:
- confidence 70+ ONLY if MULTIPLE specific features (not just category) clearly match.
- Generic resemblance ("both are power banks", "both are black gadgets") with no specific matching features must score well under 40.
- Ignore background, lighting, staging, and photo angle — the reference is a generic supplier photo, not a warehouse photo.

Respond ONLY with JSON, no markdown:
{"features_compared": "reference: <features> | photo: <features> | verdict per feature: <matches/mismatches>", "match": true or false, "confidence": 0-100, "reasoning": "short phrase, max 12 words"}`;
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

      const { data: confirmedProduct } = await supabase
        .from("products")
        .select("sku")
        .eq("id", product_id)
        .maybeSingle();
      const corrected_sku = confirmedProduct?.sku ?? null;

      const { error: prodErr } = await supabase.from("products").update({ bin_location: String(position) }).eq("id", product_id);
      if (prodErr) return json(500, { error: prodErr.message });

      const { error: scanErr } = await supabase
        .from("product_scan_history")
        .update({ confirmed_product_id: product_id, corrected_sku, status: "confirmed", actor })
        .eq("id", scan_id);
      if (scanErr) return json(500, { error: scanErr.message });

      return json(200, { ok: true, corrected_sku });
    }

    // ── FLAG ───────────────────────────────────────────────────
    if (action === "flag") {
      const { scan_id, notes } = body;
      if (!scan_id) return json(400, { error: "scan_id required" });
      const { error } = await supabase.from("product_scan_history").update({ status: "flagged", notes: notes || null }).eq("id", scan_id);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true });
    }

    // ── RESOLVE SKU CONFLICT ───────────────────────────────────
    if (action === "resolve_conflict") {
      const { sku, winner_product_id, loser_product_id, position, actor } = body;
      if (!sku || !winner_product_id || !loser_product_id || !position) {
        return json(400, { error: "sku, winner_product_id, loser_product_id, position required" });
      }

      const { data: parties, error: partyErr } = await supabase
        .from("products")
        .select("id, sku, title")
        .in("id", [winner_product_id, loser_product_id]);
      if (partyErr) return json(500, { error: partyErr.message });
      const winner = (parties || []).find((p: any) => p.id === winner_product_id);
      const loser = (parties || []).find((p: any) => p.id === loser_product_id);
      if (!winner || !loser) return json(404, { error: "winner or loser product not found" });

      // Highest purely-numeric SKU across the catalog, + 1.
      const { data: allSkus, error: skuErr } = await supabase.from("products").select("sku");
      if (skuErr) return json(500, { error: skuErr.message });
      let maxNumeric = 0;
      for (const r of allSkus || []) {
        const s = String((r as any).sku ?? "").trim();
        if (/^\d+$/.test(s)) maxNumeric = Math.max(maxNumeric, parseInt(s, 10));
      }
      const new_sku = String(maxNumeric + 1);

      const { error: loserErr } = await supabase
        .from("products")
        .update({ sku: new_sku, bin_location: new_sku })
        .eq("id", loser_product_id);
      if (loserErr) return json(500, { error: loserErr.message });

      const { error: winnerErr } = await supabase
        .from("products")
        .update({ bin_location: String(position) })
        .eq("id", winner_product_id);
      if (winnerErr) return json(500, { error: winnerErr.message });

      const notes = `SKU conflict resolved: kept SKU ${sku} for ${winner.title}; reassigned ${loser.title} to new SKU ${new_sku}`;
      const payload = {
        actor: actor ?? null,
        typed_sku: String(sku),
        position: String(position),
        photo_url: "",
        status: "confirmed",
        confirmed_product_id: winner_product_id,
        corrected_sku: winner.sku,
        notes,
      };
      const { error: histErr } = await supabase
        .from("product_scan_history")
        .upsert(payload, { onConflict: "typed_sku" })
        .select("id")
        .single();
      if (histErr) return json(500, { error: histErr.message });


      return json(200, { ok: true, new_sku, loser_product_id, loser_title: loser.title });
    }

    // ── CHECK ──────────────────────────────────────────────────
    if (action === "check") {
      const { sku, position, actor } = body;
      if (!sku || !body.photo_url) return json(400, { error: "sku and photo_url required" });
      const photo_url = toVisionUrl(String(body.photo_url)) || String(body.photo_url);

      const { data: skuRows } = await supabase
        .from("products")
        .select("id, sku, title, description, image, images")
        .ilike("sku", String(sku).trim());

      // ── Duplicate SKU: two or more real products share this SKU.
      if ((skuRows?.length ?? 0) > 1) {
        return json(200, {
          status: "duplicate_sku",
          sku,
          position,
          products: (skuRows || []).map((p: any) => ({
            id: p.id,
            sku: p.sku,
            title: p.title,
            image: refImages(p)[0] || null,
          })),
        });
      }

      const exact = skuRows?.[0] ?? null;


      let originalResult: { match: boolean; confidence: number; reasoning: string; features_compared?: string } | null = null;
      let debug: Record<string, unknown> | null = null;
      if (exact) {
        // Probe the exact URLs (post-toVisionUrl) that get sent to Gemini for the
        // primary comparison only — not the broader candidate search.
        const primaryRefs = refImages(exact);
        const [referenceImages, workerPhoto] = await Promise.all([
          Promise.all(primaryRefs.map(probeImageUrl)),
          probeImageUrl(photo_url),
        ]);
        debug = { referenceImages, workerPhoto };
        try {
          originalResult = await compareToProduct(exact, photo_url);
        } catch (err) {
          console.error("compareToProduct primary error:", err);
          originalResult = { match: false, confidence: 0, reasoning: "Vision check failed", features_compared: "", refs: [] };
        }
      }

      // ── High-confidence direct match: done.
      if (exact && originalResult && originalResult.confidence >= MATCH_THRESHOLD) {
        const { data: row } = await supabase
          .from("product_scan_history")
          .upsert({
            actor, typed_sku: sku, position, photo_url,
            matched_product_id: exact.id, confidence: originalResult.confidence, status: "matched",
          }, { onConflict: "typed_sku" })
          .select("id")
          .single();
        return json(200, {
          status: "matched",
          scan_id: row?.id,
          product: { id: exact.id, sku: exact.sku, title: exact.title },
          confidence: originalResult.confidence,
          reasoning: originalResult.reasoning,
          features_compared: originalResult.features_compared ?? "",
          debug,
        });
      }

      // ── Mismatch / not found: fingerprint the worker's photo and find the
      // nearest catalog fingerprints via pg_trgm (match_products_by_fingerprint).
      let workerFingerprint = "";
      try {
        const fpOut = await callVisionJSON(FINGERPRINT_PROMPT, [photo_url]);
        workerFingerprint = typeof fpOut.fingerprint === "string" ? fpOut.fingerprint.trim() : "";
      } catch (err) {
        console.error("fingerprint generation failed:", err);
      }

      let candidateProducts: any[] = [];
      if (workerFingerprint) {
        const { data: matches, error: matchErr } = await supabase.rpc("match_products_by_fingerprint", {
          query_fp: workerFingerprint,
          exclude_id: exact?.id || "00000000-0000-0000-0000-000000000000",
          match_limit: 10,
        });
        if (matchErr) console.error("match_products_by_fingerprint error:", matchErr.message);
        candidateProducts = (matches || []).map((m: any) => ({
          id: m.id, sku: m.sku, title: m.title, description: m.description, image: m.image, images: m.images,
        }));
      }


      const checked = await mapLimit(candidateProducts, 6, async (p) => {
        try {
          const r = await compareToProduct(p, photo_url);
          return { product: p, ...r };
        } catch (err) {
          console.error("compareToProduct candidate error:", p?.sku, err);
          return { product: p, match: false, confidence: 0, reasoning: "Vision check failed", features_compared: "", refs: [] };
        }
      });
      const ranked = checked
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
        original: exact ? { product: { id: exact.id, sku: exact.sku, title: exact.title }, confidence: originalResult?.confidence ?? 0, reasoning: originalResult?.reasoning, features_compared: originalResult?.features_compared ?? "" } : null,
        candidates: ranked,
        debug,
      });
    }

    return json(400, { error: `Unknown action: ${action}` });
  } catch (e) {
    console.error("scan-product error:", e);
    return json(500, { error: String(e) });
  }
});
