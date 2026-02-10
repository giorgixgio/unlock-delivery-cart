import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { order_id, ip_address } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: "order_id required" }), { status: 400, headers: corsHeaders });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const aiKey = Deno.env.get("LOVABLE_API_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*, order_items(id, sku, quantity, title, unit_price, line_total, image_url)")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: corsHeaders });

    // Store IP if provided
    if (ip_address && !order.ip_address) {
      await supabase.from("orders").update({ ip_address }).eq("id", order_id);
    }

    // === STEP 0: SAME-DAY AUTO-MERGE ===
    const mergeResult = await attemptAutoMerge(supabase, order);
    if (mergeResult.merged) {
      return new Response(JSON.stringify({ ok: true, merged: true, primary_order_id: mergeResult.primary_order_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // === AI NORMALIZATION ===
    const { normalizedCity, normalizedAddress, confidence, normNotes } = await normalizeAddress(order, aiKey);

    const updates: Record<string, unknown> = {};
    if (!order.raw_city) updates.raw_city = order.city;
    if (!order.raw_address) updates.raw_address = order.address_line1;
    updates.normalized_city = normalizedCity;
    updates.normalized_address = normalizedAddress;
    updates.normalization_confidence = confidence;
    updates.normalization_notes = normNotes;

    // === RISK SCORING ===
    const { riskScore, riskLevel, riskReasons } = await scoreRisk(supabase, order, order_id, ip_address, normalizedAddress, confidence);

    updates.risk_score = riskScore;
    updates.risk_level = riskLevel;
    updates.risk_reasons = riskReasons;

    if (riskLevel === "high") {
      updates.review_required = true;
      updates.status = "on_hold";
    } else if (confidence < 0.75) {
      updates.review_required = true;
    }

    await supabase.from("orders").update(updates).eq("id", order_id);

    if (riskScore > 0) {
      await supabase.from("order_events").insert({
        order_id,
        actor: "system",
        event_type: "risk_scored",
        payload: { risk_score: riskScore, risk_level: riskLevel, risk_reasons: riskReasons },
      });
    }

    return new Response(JSON.stringify({ ok: true, risk_score: riskScore, risk_level: riskLevel }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("normalize-and-score error:", e);
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: corsHeaders });
  }
});

// ============================================================
// AUTO-MERGE: Same-day obvious duplicate detection & merge
// ============================================================
async function attemptAutoMerge(supabase: any, order: any): Promise<{ merged: boolean; primary_order_id?: string }> {
  const orderId = order.id;
  const orderDate = new Date(order.created_at);
  const startOfDay = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate()).toISOString();
  const endOfDay = new Date(orderDate.getFullYear(), orderDate.getMonth(), orderDate.getDate() + 1).toISOString();

  const orderSkus = (order.order_items || []).map((i: any) => i.sku);
  if (orderSkus.length === 0) return { merged: false };

  // Find same-day candidates with strong identity match
  let query = supabase
    .from("orders")
    .select("*, order_items(id, sku, quantity, title, unit_price, line_total, image_url)")
    .neq("id", orderId)
    .gte("created_at", startOfDay)
    .lt("created_at", endOfDay)
    .in("status", ["new", "confirmed"])
    .eq("is_fulfilled", false)
    .neq("status", "merged");

  // Build identity filter: same cookie OR same phone
  const filters: string[] = [];
  if (order.cookie_id_hash) filters.push(`cookie_id_hash.eq.${order.cookie_id_hash}`);
  if (order.customer_phone) filters.push(`customer_phone.eq.${order.customer_phone}`);
  if (filters.length === 0) return { merged: false };

  query = query.or(filters.join(","));

  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) return { merged: false };

  // Check SKU overlap
  const orderSkuSet = new Set(orderSkus);
  const strongMatches = candidates.filter((c: any) => {
    const cSkus = (c.order_items || []).map((i: any) => i.sku);
    return cSkus.some((s: string) => orderSkuSet.has(s));
  });

  if (strongMatches.length !== 1) return { merged: false }; // Only merge if exactly ONE match

  const match = strongMatches[0];

  // Determine primary (earliest) and child (newest)
  const matchDate = new Date(match.created_at);
  const isPrimary = orderDate < matchDate;
  const primaryOrder = isPrimary ? order : match;
  const childOrder = isPrimary ? match : order;
  const primaryId = primaryOrder.id;
  const childId = childOrder.id;

  // Merge items: sum quantities for same SKU, append new ones
  const primaryItems: any[] = primaryOrder.order_items || [];
  const childItems: any[] = childOrder.order_items || [];
  const primarySkuMap = new Map<string, any>();
  for (const item of primaryItems) {
    primarySkuMap.set(item.sku, item);
  }

  for (const childItem of childItems) {
    const existing = primarySkuMap.get(childItem.sku);
    if (existing) {
      // Sum quantities
      const newQty = existing.quantity + childItem.quantity;
      const newLineTotal = newQty * Number(existing.unit_price);
      await supabase.from("order_items")
        .update({ quantity: newQty, line_total: newLineTotal })
        .eq("id", existing.id);
    } else {
      // Append as new item on primary order
      await supabase.from("order_items").insert({
        order_id: primaryId,
        product_id: childItem.product_id || "",
        sku: childItem.sku,
        title: childItem.title,
        quantity: childItem.quantity,
        unit_price: childItem.unit_price,
        line_total: childItem.line_total,
        image_url: childItem.image_url || "",
      });
    }
  }

  // Recalculate primary totals
  const { data: updatedItems } = await supabase
    .from("order_items")
    .select("line_total")
    .eq("order_id", primaryId);
  const newSubtotal = (updatedItems || []).reduce((sum: number, i: any) => sum + Number(i.line_total), 0);

  // Update primary order
  const existingNote = primaryOrder.internal_note || "";
  const mergeNote = `Auto-merged same-day duplicate order: ${childId}`;
  const existingTags: string[] = primaryOrder.tags || [];
  const newTags = existingTags.includes("auto_merged") ? existingTags : [...existingTags, "auto_merged"];

  await supabase.from("orders").update({
    subtotal: newSubtotal,
    total: newSubtotal + Number(primaryOrder.shipping_fee || 0) - Number(primaryOrder.discount_total || 0),
    internal_note: existingNote ? `${existingNote}\n${mergeNote}` : mergeNote,
    tags: newTags,
    risk_score: 0,
    risk_level: "low",
    risk_reasons: [],
    review_required: false,
  }).eq("id", primaryId);

  // Update child order
  await supabase.from("orders").update({
    status: "merged",
    is_confirmed: false,
    is_fulfilled: false,
    internal_note: `Merged automatically into order ${primaryId}`,
    risk_score: 0,
    risk_level: "low",
    risk_reasons: [],
    review_required: false,
  }).eq("id", childId);

  // Log events on both
  const mergePayload = { primary_order_id: primaryId, child_order_id: childId, reason: "same_day_duplicate" };
  await supabase.from("order_events").insert([
    { order_id: primaryId, actor: "system", event_type: "auto_merge", payload: { ...mergePayload, role: "primary" } },
    { order_id: childId, actor: "system", event_type: "auto_merge", payload: { ...mergePayload, role: "child" } },
  ]);

  return { merged: true, primary_order_id: primaryId };
}

// ============================================================
// AI ADDRESS NORMALIZATION
// ============================================================
async function normalizeAddress(order: any, aiKey: string | undefined) {
  const hasLatin = /[a-zA-Z]/.test(order.city + order.address_line1);
  let normalizedCity = order.city;
  let normalizedAddress = order.address_line1;
  let confidence = 1.0;
  let normNotes = "";

  if (aiKey && (hasLatin || order.city || order.address_line1)) {
    try {
      const prompt = `You are a Georgian address normalizer. Given a Georgian city and address that may contain:
- Latin characters that should be transliterated to Georgian
- Common typos in Georgian city names
- Extra spaces, weird symbols, inconsistent hyphens

Input:
City: "${order.city}"
Address: "${order.address_line1}"

Output JSON only (no markdown):
{
  "city": "normalized Georgian city name",
  "address": "normalized Georgian address",
  "confidence": 0.0-1.0,
  "notes": "what was changed"
}

Common Georgian cities: თბილისი, ბათუმი, ქუთაისი, რუსთავი, გორი, ზუგდიდი, ფოთი, ხაშური, სამტრედია, სენაკი, ოზურგეთი, ტელავი, ახალციხე, მარნეული, ქობულეთი, წყალტუბო, საგარეჯო, გარდაბანი, ბოლნისი, ლაგოდეხი, დუშეთი, მესტია, ბაღდათი, მარტვილი`;

      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${aiKey}` },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content || "";
        const jsonStr = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
        const parsed = JSON.parse(jsonStr);
        normalizedCity = parsed.city || normalizedCity;
        normalizedAddress = parsed.address || normalizedAddress;
        confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0.8;
        normNotes = parsed.notes || "";
      }
    } catch (e) {
      console.error("AI normalization failed:", e);
      confidence = 0.5;
      normNotes = "AI normalization failed, using raw values";
    }
  }

  normalizedCity = normalizedCity.trim().replace(/\s+/g, " ");
  normalizedAddress = normalizedAddress.trim().replace(/\s+/g, " ").replace(/[–—]/g, "-");

  return { normalizedCity, normalizedAddress, confidence, normNotes };
}

// ============================================================
// RISK SCORING
// ============================================================
async function scoreRisk(supabase: any, order: any, order_id: string, ip_address: string | undefined, normalizedAddress: string, confidence: number) {
  const riskReasons: string[] = [];
  let riskScore = 0;
  const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pastOrders } = await supabase
    .from("orders")
    .select("id, customer_phone, normalized_address, ip_address, cookie_id_hash, user_agent, created_at, order_items(sku, quantity)")
    .neq("id", order_id)
    .neq("status", "merged")
    .gte("created_at", tenDaysAgo)
    .or("is_confirmed.eq.true,is_fulfilled.eq.true,status.eq.new,status.eq.on_hold");

  if (pastOrders && pastOrders.length > 0) {
    if (order.cookie_id_hash) {
      const cookieMatches = pastOrders.filter((p: any) => p.cookie_id_hash === order.cookie_id_hash);
      if (cookieMatches.length > 0) {
        riskScore += 40;
        riskReasons.push(`same_cookie (${cookieMatches.length} prior orders)`);
      }
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const recentCookie = cookieMatches.filter((p: any) => p.created_at >= twoHoursAgo);
      if (recentCookie.length > 0) {
        riskScore += 20;
        riskReasons.push(`rapid_reorder (${recentCookie.length} in 2hrs)`);
      }
    }

    const phoneMatches = pastOrders.filter((p: any) => p.customer_phone === order.customer_phone);
    if (phoneMatches.length > 0) {
      riskScore += 35;
      riskReasons.push(`same_phone (${phoneMatches.length} prior)`);
    }

    if (normalizedAddress && normalizedAddress.length > 5) {
      const addrMatches = pastOrders.filter((p: any) => p.normalized_address === normalizedAddress);
      if (addrMatches.length > 0) {
        riskScore += 25;
        riskReasons.push(`same_address (${addrMatches.length} prior)`);
      }
    }

    const effectiveIp = ip_address || order.ip_address;
    if (effectiveIp) {
      const ipMatches = pastOrders.filter((p: any) => p.ip_address === effectiveIp);
      if (ipMatches.length > 0) {
        riskScore += 15;
        riskReasons.push(`same_ip (${ipMatches.length} prior)`);
      }
    }

    const orderSkus = (order.order_items || []).map((i: any) => i.sku);
    const orderSkuSet = new Set(orderSkus);
    for (const past of pastOrders) {
      const pastSkus = ((past as any).order_items || []).map((i: any) => i.sku);
      const overlap = pastSkus.some((s: string) => orderSkuSet.has(s));
      if (overlap) {
        const pastSkuQty = pastSkus.sort().join(",");
        const orderSkuQty = orderSkus.sort().join(",");
        if (pastSkuQty === orderSkuQty) {
          riskScore += 30;
          riskReasons.push("exact_sku_match");
        } else {
          riskScore += 20;
          riskReasons.push("sku_overlap");
        }
        break;
      }
    }
  }

  const phone = order.customer_phone || "";
  if (!phone || phone.length < 9) {
    riskScore += 15;
    riskReasons.push("phone_invalid");
  }
  if ((order.address_line1 || "").length < 8) {
    riskScore += 10;
    riskReasons.push("address_too_short");
  }

  if (confidence < 0.75) {
    riskReasons.push("low_confidence_address");
    riskScore = Math.max(riskScore, 25);
  }

  let riskLevel = "low";
  if (riskScore >= 50) riskLevel = "high";
  else if (riskScore >= 25) riskLevel = "medium";

  return { riskScore, riskLevel, riskReasons };
}
