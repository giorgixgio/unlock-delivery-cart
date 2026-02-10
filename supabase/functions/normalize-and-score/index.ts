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
      .select("*, order_items(sku, quantity)")
      .eq("id", order_id)
      .single();
    if (orderErr || !order) return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: corsHeaders });

    // Store IP if provided
    if (ip_address && !order.ip_address) {
      await supabase.from("orders").update({ ip_address }).eq("id", order_id);
    }

    // Store raw values
    const updates: Record<string, unknown> = {};
    if (!order.raw_city) updates.raw_city = order.city;
    if (!order.raw_address) updates.raw_address = order.address_line1;

    // === AI NORMALIZATION ===
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

    // Basic normalization fallback
    normalizedCity = normalizedCity.trim().replace(/\s+/g, " ");
    normalizedAddress = normalizedAddress.trim().replace(/\s+/g, " ").replace(/[–—]/g, "-");

    updates.normalized_city = normalizedCity;
    updates.normalized_address = normalizedAddress;
    updates.normalization_confidence = confidence;
    updates.normalization_notes = normNotes;

    // === RISK SCORING ===
    const riskReasons: string[] = [];
    let riskScore = 0;
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Query past orders (confirmed or fulfilled) in last 10 days
    const { data: pastOrders } = await supabase
      .from("orders")
      .select("id, customer_phone, normalized_address, ip_address, cookie_id_hash, user_agent, created_at, order_items(sku, quantity)")
      .neq("id", order_id)
      .gte("created_at", tenDaysAgo)
      .or("is_confirmed.eq.true,is_fulfilled.eq.true,status.eq.new,status.eq.on_hold");

    if (pastOrders && pastOrders.length > 0) {
      // Same cookie
      if (order.cookie_id_hash) {
        const cookieMatches = pastOrders.filter((p: any) => p.cookie_id_hash === order.cookie_id_hash);
        if (cookieMatches.length > 0) {
          riskScore += 40;
          riskReasons.push(`same_cookie (${cookieMatches.length} prior orders)`);
        }
        // Multiple orders from same cookie in <2 hours
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const recentCookie = cookieMatches.filter((p: any) => p.created_at >= twoHoursAgo);
        if (recentCookie.length > 0) {
          riskScore += 20;
          riskReasons.push(`rapid_reorder (${recentCookie.length} in 2hrs)`);
        }
      }

      // Same phone
      const phoneMatches = pastOrders.filter((p: any) => p.customer_phone === order.customer_phone);
      if (phoneMatches.length > 0) {
        riskScore += 35;
        riskReasons.push(`same_phone (${phoneMatches.length} prior)`);
      }

      // Same normalized address
      if (normalizedAddress && normalizedAddress.length > 5) {
        const addrMatches = pastOrders.filter((p: any) => p.normalized_address === normalizedAddress);
        if (addrMatches.length > 0) {
          riskScore += 25;
          riskReasons.push(`same_address (${addrMatches.length} prior)`);
        }
      }

      // Same IP
      const effectiveIp = ip_address || order.ip_address;
      if (effectiveIp) {
        const ipMatches = pastOrders.filter((p: any) => p.ip_address === effectiveIp);
        if (ipMatches.length > 0) {
          riskScore += 15;
          riskReasons.push(`same_ip (${ipMatches.length} prior)`);
        }
      }

      // SKU overlap
      const orderSkus = (order.order_items || []).map((i: any) => i.sku);
      const orderSkuSet = new Set(orderSkus);
      for (const past of pastOrders) {
        const pastSkus = ((past as any).order_items || []).map((i: any) => i.sku);
        const overlap = pastSkus.some((s: string) => orderSkuSet.has(s));
        if (overlap) {
          // Check exact match
          const pastSkuQty = pastSkus.sort().join(",");
          const orderSkuQty = orderSkus.sort().join(",");
          if (pastSkuQty === orderSkuQty) {
            riskScore += 30;
            riskReasons.push("exact_sku_match");
          } else {
            riskScore += 20;
            riskReasons.push("sku_overlap");
          }
          break; // Only count once
        }
      }
    }

    // Behavior signals
    const phone = order.customer_phone || "";
    if (!phone || phone.length < 9) {
      riskScore += 15;
      riskReasons.push("phone_invalid");
    }
    if ((order.address_line1 || "").length < 8) {
      riskScore += 10;
      riskReasons.push("address_too_short");
    }

    // Low confidence address
    if (confidence < 0.75) {
      riskReasons.push("low_confidence_address");
      riskScore = Math.max(riskScore, 25);
    }

    // Determine risk level
    let riskLevel = "low";
    if (riskScore >= 50) riskLevel = "high";
    else if (riskScore >= 25) riskLevel = "medium";

    updates.risk_score = riskScore;
    updates.risk_level = riskLevel;
    updates.risk_reasons = riskReasons;

    // Actions based on risk
    if (riskLevel === "high") {
      updates.review_required = true;
      updates.status = "on_hold";
    } else if (confidence < 0.75) {
      updates.review_required = true;
    }

    // Update order
    await supabase.from("orders").update(updates).eq("id", order_id);

    // Log risk scoring event
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
