import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const MODEL = "google/gemini-3.6-flash";

const SYSTEM = `You are a customs classification assistant supporting a freight forwarder review process for goods imported into Georgia (the country).

Rules you must follow, in order of priority:
1. Classify accurately and defensibly according to the Harmonized System (HS) and Georgia's national commodity nomenclature. Correctness comes first, always.
2. ONLY when a genuine, real ambiguity exists between two or more equally valid HS headings for the actual product may you prefer the valid option with the lower compliance/certification burden. If one heading is clearly correct, use it even if it carries a heavier burden.
3. Provide the FULL Georgian national commodity code, not just the bare 6-digit international HS heading. Georgia extends the international 6-digit HS code to a longer national nomenclature code (typically 8-10 digits total). Format the code with standard dot-grouping (e.g. XXXX.XX.XX or XXXX.XX.XX.XX) following HS/national nomenclature conventions. A bare 6-digit heading such as "8513.10" is NOT usable as a final declaration code — always extend it to the full national code when you can.
4. If you can only confidently determine the 6-digit international heading but cannot confidently determine the full Georgian national extension, still return the 6-digit heading as hs_code (dot-grouped), but MUST say so explicitly in hs_notes (e.g. "Base HS heading identified; full Georgian national code needs confirmation from forwarder") and set confidence to "medium" at best — never present a 6-digit code as if it were a complete declaration code.
5. Certification requirements — Georgian import context only:
   - DO NOT flag battery / electrical-and-electronic-equipment waste management (extended producer responsibility, "მგვ" / ნარჩენების მართვის მწარმოებლის გაფართოებული ვალდებულება) as a certification need. The importing business already holds that company-level registration covering batteries and electronics — it is satisfied at the company level and does NOT apply per-product. Never set hs_requires_certification=true or mention it in hs_notes on that basis, regardless of the product.
   - DO still flag "წინასწარი შეტყობინება" (pre-notification) requirements that apply to certain product categories in the Georgian import/customs context (e.g. certain power tools, construction equipment, machinery, and other categories subject to pre-market notification/conformity assessment). Set hs_requires_certification=true and state it plainly in hs_notes when such a requirement genuinely applies.
   - NEVER attempt to evade or hide a legitimate certification requirement (other than the already-satisfied მგვ waste-management registration above). Misclassification to dodge certification is a legal and compliance risk.
6. If you cannot classify confidently, say so: set confidence "low" and explain what extra information is needed.

You are assisting, not replacing, forwarder/logistics review.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await admin.rpc("is_active_admin", { user_id: userData.user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const itemId = String(body?.item_id || "").trim();
    if (!itemId) return json({ error: "item_id required" }, 400);

    const { data: item, error: itemErr } = await admin
      .from("wholesale_items")
      .select("id, title, alibaba_title, notes, image_url, images")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr) return json({ error: itemErr.message }, 500);
    if (!item) return json({ error: "Item not found" }, 404);

    const title = String(item.title || "").trim();
    const imageList: string[] = Array.isArray(item.images) ? (item.images as string[]) : [];
    const primaryPath = item.image_url || imageList[0] || null;
    if (!title) return json({ error: "Add a title and at least one image first" }, 400);
    if (!primaryPath) return json({ error: "Add a title and at least one image first" }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured" }, 500);

    // Inline the private image as a base64 data URL (signed URLs may not be
    // reachable by the provider, and base64 avoids the linked-image cap).
    let imageDataUrl: string | null = null;
    try {
      const dl = await admin.storage.from("wholesale-images").download(primaryPath);
      if (dl.data) {
        const buf = new Uint8Array(await dl.data.arrayBuffer());
        if (buf.byteLength > 0 && buf.byteLength < 8_000_000) {
          let bin = "";
          for (let i = 0; i < buf.length; i += 0x8000) {
            bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          }
          const mime = dl.data.type || "image/jpeg";
          imageDataUrl = `data:${mime};base64,${btoa(bin)}`;
        }
      }
    } catch (_) {
      imageDataUrl = null;
    }

    const textPrompt = [
      "Classify this imported product for customs and suggest a Georgian national commodity code (HS-based, 8-10 digits).",
      "",
      `Product title: ${title}`,
      item.alibaba_title ? `Supplier listing title: ${item.alibaba_title}` : null,
      item.notes ? `Internal notes: ${item.notes}` : null,
      imageDataUrl
        ? "A product photo is attached — use it to confirm the product's real nature."
        : "NO product photo could be loaded, so you are working from text only. Because of this limitation, cap your confidence at 'medium' at best.",
      "",
      "Respond with ONLY a JSON object, no markdown fences:",
      `{"hs_code":"the FULL Georgian national commodity code (8-10 digits, dot-grouped) — or the 6-digit international heading if you cannot determine the national extension, clearly noted","confidence":"high|medium|low","requires_certification":true|false|null,"notes":"1-3 short sentences of rationale, the full national code status (complete or needs forwarder confirmation), any წინასწარი შეტყობინება pre-notification requirement stated plainly, plus what extra info is needed if confidence is low"}`,
      "Use null for requires_certification only when you genuinely cannot tell. Never flag battery/electronics waste-management (მგვ) registration — it is already satisfied at the company level.",
    ]
      .filter(Boolean)
      .join("\n");

    const userContent: unknown[] = [{ type: "text", text: textPrompt }];
    if (imageDataUrl) userContent.push({ type: "image_url", image_url: { url: imageDataUrl } });

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userContent },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "Rate limit reached, try again shortly" }, 429);
    if (aiRes.status === 402) return json({ error: "AI credits exhausted" }, 402);
    if (aiRes.status === 403) return json({ error: "AI access is blocked for this workspace" }, 403);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI request failed: ${t.slice(0, 200)}` }, 500);
    }

    const data = await aiRes.json();
    const raw = String(data?.choices?.[0]?.message?.content || "").trim();
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch { /* ignore */ }
      }
    }

    const hsCode = String(parsed.hs_code || "").trim().slice(0, 32);
    if (!hsCode) {
      return json({ error: "The AI could not produce a usable classification. Needs manual review." }, 502);
    }

    let confidence = String(parsed.confidence || "").toLowerCase();
    if (!["high", "medium", "low"].includes(confidence)) confidence = "low";
    // Text-only classification can never be 'high'.
    if (!imageDataUrl && confidence === "high") confidence = "medium";

    const certRaw = parsed.requires_certification;
    const requiresCert = certRaw === true ? true : certRaw === false ? false : null;
    const notes = String(parsed.notes || "").trim().slice(0, 1200) || null;

    const { error: updErr } = await admin
      .from("wholesale_items")
      .update({
        hs_code: hsCode,
        hs_confidence: confidence,
        hs_requires_certification: requiresCert,
        hs_notes: notes,
      })
      .eq("id", itemId);
    if (updErr) return json({ error: updErr.message }, 500);

    return json({
      hs_code: hsCode,
      hs_confidence: confidence,
      hs_requires_certification: requiresCert,
      hs_notes: notes,
      used_image: !!imageDataUrl,
    });
  } catch (err) {
    return json({ error: String((err as Error).message || err) }, 500);
  }
});
