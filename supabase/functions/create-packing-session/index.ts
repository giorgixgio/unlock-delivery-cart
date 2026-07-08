// Create Packing Session
// --------------------------------------------------------------
// Freezes the current pool of confirmed orders into a session:
//   • classifies each order single-SKU vs multi-SKU
//   • multi-SKU orders are chunked into rounds of `round_size`, each
//     order pinned to a (run_number, slot_number) — this is what the
//     printed [R##-##] tags and the packing tab both read, so they
//     can never drift apart even if new orders come in afterward.
//   • single-SKU orders are recorded but not slotted (each is a whole parcel)
// Reuses existing tables: packing_waves, packing_wave_orders,
// packing_runs, packing_run_slots.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const actor = String(body.actor || "admin");
    const roundSize = Math.max(1, parseInt(String(body.round_size ?? "10"), 10) || 10);

    // 1. Pull eligible orders (same rule as the old export path).
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

    // 2. Classify.
    const classified = orders.map((o: any) => {
      const skus = new Set((o.order_items || []).map((i: any) => String(i.sku || "")));
      return { order: o, multi: skus.size > 1 };
    });
    const singles = classified.filter((c) => !c.multi);
    const multis = classified.filter((c) => c.multi).sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime());

    // 3. Create the session (wave).
    const { data: wave, error: waveErr } = await supabase
      .from("packing_waves")
      .insert({ created_by: actor, status: "active" })
      .select("id, wave_number")
      .single();
    if (waveErr || !wave) return json(500, { error: waveErr?.message || "Could not create session" });
    const waveId = wave.id;

    // 4. Record classification for every order.
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

    // 5. Chunk multi-SKU into rounds -> runs + slots.
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

    // 6. Stamp orders so they aren't pulled into a second session.
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
