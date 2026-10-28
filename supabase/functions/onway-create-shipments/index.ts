// Admin-only: build (dry run) or send TrendMart (store B) shipments to the Onway API.
// Every Onway call goes through the static-IP proxy.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { proxyFetch } from "../_shared/proxyFetch.ts";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { onwayBatchCounts } from "../_shared/telegramAlertPolicy.ts";
import { heldReasons, reviewState, classifyOnwayReply } from "../_shared/onwayReview.ts";
import { cityKey } from "../_shared/onwayRegions.ts";
import { z } from "npm:zod@3";
import {
  alreadySent, buildOnwayPayload, looksSuccessful, maskPayload, missingFields, parseTracking,
} from "./payload.ts";

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

    // --- Admin auth (same as export-courier) ---
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData } = await authClient.auth.getUser();
    if (!userData?.user) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: isAdmin } = await supabase.rpc("is_active_admin", { user_id: userData.user.id });
    if (!isAdmin) return json({ error: "Forbidden" }, 403);
    const actor = userData.user.email || userData.user.id;

    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const parsedBody = z.object({ action: z.enum(["account_check","review_list","review_save"]).optional(), dry_run: z.boolean().optional(), order_ids: z.array(z.string().uuid()).max(1000).optional(), wave_id: z.string().uuid().nullable().optional(), round_size: z.coerce.number().int().min(1).max(100).optional(), review: z.object({ order_id: z.string().uuid(), version: z.number().int(), region_id: z.string().max(100), address: z.string().max(300), name: z.string().max(255), phone: z.string().max(20), decision: z.enum(["confirm","exists","not_exists"]), tracking: z.string().max(100).optional() }).optional() }).safeParse(body);
    if (!parsedBody.success) return json({ error: "Invalid request" }, 400);
    body = parsedBody.data;
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

    const regionRows: {id:string;name:string}[] = [];
    const aliasRows: {alias:string;region_id:string}[] = [];
    for (let offset=0;;offset+=1000) {
      const {data,error}=await supabase.from("onway_regions").select("id,name").eq("active",true).order("id").range(offset,offset+999);
      if(error) return json({error:"Could not load Onway cities"},500); regionRows.push(...(data||[])); if(!data || data.length<1000) break;
    }
    for (let offset=0;;offset+=1000) {
      const {data,error}=await supabase.from("onway_region_aliases").select("alias,region_id").order("alias").range(offset,offset+999);
      if(error) return json({error:"Could not load city mappings"},500); aliasRows.push(...(data||[])); if(!data || data.length<1000) break;
    }
    const regionMap=new Map(regionRows.map(r=>[r.id,r]));
    const nameMap=new Map(regionRows.map(r=>[cityKey(r.name),r]));
    const aliasMap=new Map(aliasRows.map(a=>[a.alias,a.region_id]));
    const resolveCity=(o:any)=>nameMap.get(cityKey(o.normalized_city || o.city)) || regionMap.get(aliasMap.get(cityKey(o.normalized_city || o.city)) || "");
    if (body.action === "review_save") {
      const r=body.review;
      if(!r) return json({error:"Review required"},400);
      // Verify store eligibility below before running a service-only atomic review action.
      body.order_ids=[r.order_id];
    }
    const dryRun = body.dry_run !== false;
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
    const {data: permits, error: permitError}=await supabase.from("onway_order_reviews").select("*");
    if(permitError) return json({error:"Could not load review authorization"},500);
    const permitMap=new Map((permits||[]).map((p:any)=>[p.order_id,p]));
    const authorizedReview=(o:any)=>permitMap.get(o.id)?.reviewed_version===o.version;
    const retryAllowed=(o:any)=>authorizedReview(o) && permitMap.get(o.id)?.retry_permitted===true;
    const reasonsFor=(o:any)=> {
      const reasons=heldReasons({...o,onway_reviewed_at:authorizedReview(o)?permitMap.get(o.id)?.reviewed_at:null});
      if(!resolveCity(o)) reasons.push("city_not_mapped");
      return reasons;
    };
    if(body.action==="review_save") {
      const r=body.review;
      const o=storeOrders.find((o:any)=>o.id===r.order_id);
      if(!o) return json({error:"Not an eligible TrendMart order"},400);
      const {data,error}=await supabase.rpc("onway_review_save", {p_order_id:r.order_id,p_version:r.version,p_region_id:r.region_id,p_address:r.address,p_name:r.name,p_phone:r.phone,p_actor:actor,p_decision:r.decision,p_tracking:r.tracking || null});
      return error?json({error:error.message},409):json(data);
    }
    if(body.action==="review_list") return json({orders:storeOrders.flatMap((o:any)=> {
      const state=reviewState({...o,onway_reviewed_at:authorizedReview(o)?permitMap.get(o.id)?.reviewed_at:null}) || (!alreadySent(o)&&reasonsFor(o).length?"held":null);
      return state?[{order_id:o.id,order_number:o.public_order_number,version:o.version,customer_name:o.customer_name,customer_phone:o.customer_phone,city:o.normalized_city||o.city,address:o.normalized_address||o.address_line1,region_id:resolveCity(o)?.id || null,state,error:o.onway_error_text,reasons:reasonsFor(o)}]:[];
    })});

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
    const skipped = targets.filter((a) => alreadySent(a.order) && !retryAllowed(a.order)).map((a) => ({
      order_id: a.order.id, order_number: a.order.public_order_number,
      onway_tracking: a.order.onway_tracking, onway_sent_at: a.order.onway_sent_at, onway_api_status: a.order.onway_api_status,
    }));
    targets = targets.filter((a) => !alreadySent(a.order) || retryAllowed(a.order));

    // --- Normalize safety net (same as export-courier) ---
    for (const t of dryRun ? [] : targets) {
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
      const region=resolveCity(order);
      if(region) { payload.to_city=region.name; Object.assign(payload,{to_city_id:region.id}); }
      const held=reasonsFor(order);
      const missing = missingFields(payload);
      if (!(order.order_items || []).length) missing.push("items");
      return { order, tag: a.tag, payload, missing, held };
    });

    if (dryRun) {
      return json({
        dry_run: true,
        count: built.length,
        ready_count: built.filter((b) => !b.missing.length && !b.held.length).length,
        held_count: built.filter(b=>b.held.length).length,
        skipped_already_sent: skipped,
        orders: built.map((b) => ({
          order_id: b.order.id, order_number: b.order.public_order_number, tag: b.tag,
          missing: b.missing, held: b.held, payload: maskPayload(b.payload),
        })),
      });
    }

    // --- Real send: one by one, lock first, keep going on errors ---
    const results: { ok: boolean; skipped?: boolean; [key: string]: unknown }[] = [];
    for (const b of built) {
      const base = { order_id: b.order.id, order_number: b.order.public_order_number };
      if(b.held.length) { results.push({...base,ok:false,skipped:true,state:"held",error:b.held.join(", ")}); continue; }
      if (b.missing.length) { results.push({ ...base, ok: false, skipped: true, error: `missing: ${b.missing.join(", ")}` }); continue; }
      // Atomic lock: only one request can claim an unsent order.
      const { data: locked } = await supabase.rpc("onway_claim_shipment",{p_order_id:b.order.id,p_version:b.order.version});
      if (!locked) { results.push({ ...base, ok: false, skipped: true, error: "already sent/locked or changed" }); continue; }

      let status: number | null = null, raw = "", err: string | null = null;
      try {
        const r = await proxyFetch(ONWAY_BASE + "api/order/add", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b.payload),
        });
        status = r.status; raw = await r.text();
      } catch (e) { err = String(e); }
      const tracking = raw ? parseTracking(raw) : null;
      raw=raw.split(key).join("***").split(username).join("***");
      const state=classifyOnwayReply(status,raw,tracking);
      const ok = !err && state==="sent";
      await logCall({ order_id: b.order.id, endpoint: "api/order/add", request_masked: maskPayload(b.payload), http_status: status, response_raw: raw, parsed_tracking: tracking, error_message: err });
      // onway_sent_at stays set even on failure: Onway may have created it anyway.
      await supabase.from("orders").update({
        onway_api_status: ok ? "sent" : "unclear", onway_error_text:ok?null:(err || raw.slice(0,2000) || `HTTP ${status}`), ...(ok && tracking ? { onway_tracking: tracking } : {}),
      }).eq("id", b.order.id);
      results.push({ ...base, ok, state:ok?"sent":"unclear", http_status: status, tracking:ok?tracking:null, response_raw: raw.slice(0, 1000), error: err || (!ok?raw.slice(0,1000):null) });
    }
    // One owner notification per actual API batch, never per order or preview.
    const counts = onwayBatchCounts(results);
    if (counts.attempted > 0) {
      const notify = async () => {
        try {
          const sent = await sendTelegramMessage(`📦 Onway — API ატვირთვა\n👤 ${actor}\n` +
            `შეკვეთები: ${counts.attempted}\n✅ წარმატებული პასუხი: ${counts.sent}\n⚠️ შესამოწმებელი/შეცდომა: ${counts.failed}`);
          if (!sent.ok) console.error("Onway batch Telegram alert failed", sent.status, sent.error);
        } catch (error) { console.error("Onway batch Telegram alert failed", error); }
      };
      EdgeRuntime.waitUntil(notify());
    }
    return json({ dry_run: false, skipped_already_sent: skipped, results, sent_count:results.filter(r=>r.ok).length, review_count:results.filter(r=>!r.ok).length });
  } catch (e) {
    console.error("onway-create-shipments error:", e);
    return json({ error: String(e) }, 500);
  }
});
