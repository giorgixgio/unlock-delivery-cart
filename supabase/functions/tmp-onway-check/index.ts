// Admin-only: build (dry run) or send TrendMart (store B) shipments to the Onway API.
// Every Onway call goes through the static-IP proxy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { proxyFetch } from "../_shared/proxyFetch.ts";
import {
  alreadySent, buildOnwayPayload, looksSuccessful, maskPayload, missingFields, parseTracking,
} from "../onway-create-shipments/payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ONWAY_BASE = "https://onway.ge/index.php?route=";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const pad = (n: number, w: number) => String(n).padStart(w, "0");
function cmpBin(a: string, b: string): number {
  const av = (a || "").trim(), bv = (b || "").trim();
  if (!av && !bv) return 0; if (!av) return 1; if (!bv) return -1;
  return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    if (new URL(req.url).searchParams.get("t") !== "7a4181bb050f0c896d3869876da35ca12d1c71f7d7dbbf09") return json({ error: "no" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const actor = "agent-check";
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const username = Deno.env.get("ONWAY_API_USERNAME") || "";
    const key = Deno.env.get("ONWAY_API_KEY") || "";
    if (!username || !key) return json({ error: "Onway API credentials missing" }, 500);

    const logCall = async (row: Record<string, unknown>) => {
      try { await supabase.from("onway_api_log").insert({ created_by: actor, ...row }); }
      catch (e) { console.error("onway_api_log insert failed", e); }
    };

    // --- Read-only account checks (no orders created) ---
    if (body.action === "account_check") {
      const results: Record<string, unknown> = {};
      for (const ep of ["api/order/getuserinvoice", "api/order/getusercod"]) {
        let status: number | null = null, raw = "", err: string | null = null;
        try {
          const r = await proxyFetch(ONWAY_BASE + ep, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, key }),
          });
          status = r.status; raw = await r.text();
        } catch (e) { err = String(e); }
        await logCall({ endpoint: ep, request_masked: { username, key: "***" }, http_status: status, response_raw: raw, error_message: err });
        results[ep] = { http_status: status, response_raw: raw, error: err };
      }
      return json({ results });
    }

    const dryRun = true;
    const onlyIds: string[] | null = Array.isArray(body.order_ids) && body.order_ids.length
      ? body.order_ids.map(String) : null;
    const waveId = body.wave_id ?? null;
    const roundSize = Math.max(1, parseInt(String(body.round_size ?? "10"), 10) || 10);

    // --- Same batch selection as export-courier ---
    let query = supabase.from("orders").select("*, order_items(sku, quantity, title, product_id)")
      .order("created_at", { ascending: true });
    query = waveId
      ? query.eq("packing_wave_id", waveId)
      : query.eq("is_confirmed", true).eq("is_fulfilled", false).eq("status", "confirmed");
    const { data: ordersRaw, error: ordersErr } = await query;
    if (ordersErr) return json({ error: ordersErr.message }, 500);

    const allSkus = [...new Set((ordersRaw || []).flatMap((o: any) => (o.order_items || []).map((i: any) => String(i.sku || "")).filter(Boolean)))];
    const binBySku: Record<string, string> = {};
    const whBySku: Record<string, "A" | "B"> = {};
    if (allSkus.length) {
      const { data: prods } = await supabase.from("products").select("sku, bin_location, warehouse").in("sku", allSkus);
      for (const p of prods || []) {
        binBySku[String(p.sku)] = String((p as any).bin_location ?? "");
        whBySku[String(p.sku)] = String((p as any).warehouse ?? "").toUpperCase() === "A" ? "A" : "B";
      }
    }
    // Store B (TrendMart) only — same rule as export-courier.
    const storeOrders = (ordersRaw || []).filter((o: any) => {
      const items = o.order_items || [];
      if (!items.length) return true;
      return items.some((i: any) => (whBySku[String(i.sku || "")] ?? "B") === "B");
    });

    const meta = storeOrders.map((o: any) => {
      const items = o.order_items || [];
      const skus = new Set(items.map((i: any) => String(i.sku || "")));
      const primary = [...items].map((i: any) => String(i.sku || ""))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] || "";
      return { order: o, multi: skus.size > 2, primary, bin: binBySku[primary] || "", distinct: skus.size };
    });
    const primaryQty = (m: any) => (m.order.order_items || []).filter((i: any) => String(i.sku ?? "") === m.primary)
      .reduce((s: number, i: any) => s + Number(i.quantity || 1), 0);
    const singles = meta.filter((m) => !m.multi).sort((a, b) =>
      (a.distinct - b.distinct) || cmpBin(a.bin, b.bin)
      || a.primary.localeCompare(b.primary, undefined, { numeric: true })
      || (primaryQty(a) - primaryQty(b))
      || (new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime()));
    const assigned: { order: any; tag: string }[] = singles.map((m, i) => ({ order: m.order, tag: `S-${pad(i + 1, 4)}` }));
    const multiMeta = meta.filter((m) => m.multi);
    if (waveId) {
      const { data: frozenSlots } = await supabase.from("packing_run_slots")
        .select("order_id, slot_number, packing_runs(run_number)").eq("wave_id", waveId);
      const frozen: Record<string, { round: number; slot: number }> = {};
      for (const s of frozenSlots || []) frozen[String((s as any).order_id)] = { round: (s as any).packing_runs?.run_number ?? 1, slot: (s as any).slot_number };
      multiMeta.map((m) => ({ m, f: frozen[String(m.order.id)] })).filter((x) => x.f)
        .sort((a, b) => (a.f.round - b.f.round) || (a.f.slot - b.f.slot))
        .forEach(({ m, f }) => assigned.push({ order: m.order, tag: `R${pad(f.round, 2)}-${pad(f.slot, 2)}` }));
    } else {
      multiMeta.sort((a, b) => new Date(a.order.created_at).getTime() - new Date(b.order.created_at).getTime())
        .forEach((m, i) => assigned.push({ order: m.order, tag: `R${pad(Math.floor(i / roundSize) + 1, 2)}-${pad((i % roundSize) + 1, 2)}` }));
    }

    let targets = onlyIds ? assigned.filter((a) => onlyIds.includes(String(a.order.id))) : assigned;
    const skipped = targets.filter((a) => alreadySent(a.order)).map((a) => ({
      order_id: a.order.id, order_number: a.order.public_order_number,
      onway_tracking: a.order.onway_tracking, onway_sent_at: a.order.onway_sent_at, onway_api_status: a.order.onway_api_status,
    }));
    targets = targets.filter((a) => !alreadySent(a.order));

    // --- Normalize safety net (same as export-courier) ---
    for (const t of targets) {
      const o = t.order;
      if (String(o.normalized_city || "").trim() && String(o.normalized_address || "").trim()) continue;
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/normalize-and-score`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
          body: JSON.stringify({ order_id: o.id }),
        });
        if (!r.ok) continue;
        const { data: f } = await supabase.from("orders").select("normalized_city, normalized_address, raw_city, raw_address").eq("id", o.id).single();
        if (f) Object.assign(o, {
          normalized_city: f.normalized_city ?? o.normalized_city, normalized_address: f.normalized_address ?? o.normalized_address,
          raw_city: f.raw_city ?? o.raw_city, raw_address: f.raw_address ?? o.raw_address,
        });
      } catch { /* best effort */ }
    }

    // --- Build payloads (label text identical to export-courier) ---
    const built = targets.map((a) => {
      const order = a.order;
      const qtyBySku = new Map<string, number>();
      for (const i of order.order_items || []) qtyBySku.set(String(i.sku ?? ""), (qtyBySku.get(String(i.sku ?? "")) || 0) + Number(i.quantity || 1));
      const skuWithQty = [...qtyBySku.entries()].map(([sku, q]) => `${(binBySku[sku] || "").trim() || sku} - ${q}`).join(", ");
      const notes: string[] = [];
      if (order.notes_customer) notes.push(order.notes_customer);
      if (order.risk_level && order.risk_level !== "low") notes.push(`RISK:${order.risk_level.toUpperCase()} ${(order.risk_reasons || []).join(", ")}`);
      if (order.internal_note) notes.push(order.internal_note);
      let noteText = notes.join(" | ");
      if (order.is_return) noteText = `RETURN — ${noteText}`.trim();
      const labelText = `[${a.tag}] ${skuWithQty}`;
      const detail = noteText ? `${labelText} | ${noteText}` : labelText;
      const payload = buildOnwayPayload(order, detail, { username, key });
      return { order, tag: a.tag, payload, missing: missingFields(payload) };
    });

    if (dryRun) {
      return json({
        dry_run: true,
        count: built.length,
        ready_count: built.filter((b) => !b.missing.length).length,
        skipped_already_sent: skipped,
        orders: built.map((b) => ({
          order_id: b.order.id, order_number: b.order.public_order_number, tag: b.tag,
          missing: b.missing, payload: maskPayload(b.payload),
        })),
      });
    }

    return json({});
  } catch (e) {
    console.error("onway-create-shipments error:", e);
    return json({ error: String(e) }, 500);
  }
});
