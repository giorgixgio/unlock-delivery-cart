// Create Packing Session
// Admin-only. Freezes the current pool of confirmed orders into a session.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/**
 * Greedy route clustering: seed a round with the earliest unassigned order,
 * then repeatedly append the unassigned order whose bin set adds the fewest
 * NEW distinct bins to the round, until the round is full. Repeat with a
 * fresh seed until every order is assigned.
 */
function buildOptimizedRounds<T>(
  items: T[],
  roundSize: number,
  binsOf: (item: T) => Set<string>,
): T[][] {
  const remaining = items.map((item, idx) => ({ item, idx, bins: binsOf(item) }));
  const rounds: T[][] = [];

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const round = [seed];
    const combined = new Set(seed.bins);

    while (round.length < roundSize && remaining.length > 0) {
      let bestPos = 0;
      let bestNew = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        let added = 0;
        for (const b of remaining[i].bins) if (!combined.has(b)) added++;
        // tie-break on original (created_at) order — remaining stays sorted
        if (added < bestNew) {
          bestNew = added;
          bestPos = i;
          if (added === 0) break;
        }
      }
      const [picked] = remaining.splice(bestPos, 1);
      for (const b of picked.bins) combined.add(b);
      round.push(picked);
    }

    rounds.push(round.map((r) => r.item));
  }

  return rounds;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // --- Auth: require an active admin JWT ---
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "Unauthorized" });
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsRes, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsRes?.claims?.sub) {
      return json(401, { error: "Unauthorized" });
    }
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_active_admin", {
      user_id: claimsRes.claims.sub,
    });
    if (adminErr || !isAdmin) {
      return json(403, { error: "Forbidden" });
    }

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const actor = String(body.actor || "admin");
    const roundSize = Math.max(1, parseInt(String(body.round_size ?? "10"), 10) || 10);

    const { data: eligible, error: eligErr } = await supabase
      .from("orders")
      .select("id, created_at, customer_phone, tracking_number, order_items(sku)")
      .eq("is_confirmed", true)
      .eq("is_fulfilled", false)
      .eq("status", "confirmed")
      .is("packing_wave_id", null)
      .neq("customer_phone", "")
      .order("created_at", { ascending: true });

    if (eligErr) return json(500, { error: eligErr.message });
    const orders = (eligible || []).filter((o: any) => (o.order_items || []).length > 0);

    if (orders.length === 0) {
      return json(200, { ok: true, empty: true, message: "No eligible confirmed orders to pack." });
    }

    const classified = orders.map((o: any) => {
      const skus = new Set((o.order_items || []).map((i: any) => String(i.sku || "")));
      return { order: o, multi: skus.size > 1 };
    });
    const singles = classified.filter((c) => !c.multi);
    const multis = classified.filter((c) => c.multi).sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime());

    // --- Resolve each multi-SKU order's distinct bin locations ---
    // order_items.sku -> products.sku -> products.bin_location
    const multiSkus = [
      ...new Set(
        multis.flatMap((c: any) => (c.order.order_items || []).map((i: any) => String(i.sku || ""))),
      ),
    ].filter(Boolean);
    const skuToBin = new Map<string, string>();
    for (let i = 0; i < multiSkus.length; i += 500) {
      const { data: prods, error: prodErr } = await supabase
        .from("products")
        .select("sku, bin_location")
        .in("sku", multiSkus.slice(i, i + 500));
      if (prodErr) return json(500, { error: prodErr.message });
      for (const p of (prods || []) as any[]) {
        if (p.bin_location) skuToBin.set(String(p.sku), String(p.bin_location));
      }
    }
    // Unknown/missing bins stay distinct per SKU so they aren't merged into one fake stop.
    const binsOf = (c: any) =>
      new Set<string>(
        (c.order.order_items || []).map(
          (i: any) => skuToBin.get(String(i.sku || "")) || `?sku:${i.sku}`,
        ),
      );


    const { data: wave, error: waveErr } = await supabase
      .from("packing_waves")
      .insert({ created_by: actor, status: "active" })
      .select("id, wave_number")
      .single();
    if (waveErr || !wave) return json(500, { error: waveErr?.message || "Could not create session" });
    const waveId = wave.id;

    const waveOrderRows = classified.map((c) => {
      const skus = new Set((c.order.order_items || []).map((i: any) => String(i.sku || "")));
      const primary = [...(c.order.order_items || [])].map((i: any) => String(i.sku || "")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] || "";
      return {
        wave_id: waveId,
        order_id: c.order.id,
        classification: c.multi ? "multi_sku" : "single_sku",
        primary_sku: primary,
        sku_count: skus.size,
        total_qty: 0,
      };
    });
    await supabase.from("packing_wave_orders").insert(waveOrderRows);

    const roundCount = Math.ceil(multis.length / roundSize);
    for (let r = 0; r < roundCount; r++) {
      const chunk = multis.slice(r * roundSize, r * roundSize + roundSize);
      const { data: run, error: runErr } = await supabase
        .from("packing_runs")
        .insert({ wave_id: waveId, run_number: r + 1, slot_count: chunk.length, created_by: actor, status: "pending" })
        .select("id")
        .single();
      if (runErr || !run) return json(500, { error: runErr?.message || "Could not create round" });

      const slotRows = chunk.map((c, i) => ({
        wave_id: waveId,
        run_id: run.id,
        slot_number: i + 1,
        order_id: c.order.id,
        packing_status: "pending",
        tracking_number_snapshot: c.order.tracking_number || null,
      }));
      await supabase.from("packing_run_slots").insert(slotRows);
    }

    await supabase
      .from("orders")
      .update({ packing_wave_id: waveId })
      .in("id", orders.map((o: any) => o.id));

    return json(200, {
      ok: true,
      wave_id: waveId,
      wave_number: wave.wave_number,
      total: orders.length,
      single_count: singles.length,
      multi_count: multis.length,
      round_size: roundSize,
      round_count: roundCount,
    });
  } catch (e) {
    console.error("create-packing-session error:", e);
    return json(500, { error: String(e) });
  }
});
