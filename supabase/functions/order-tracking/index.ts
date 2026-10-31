// order-tracking — public, token-based order status for customers (/t/:token).
// Returns only safe fields; writes go to operator tasks, feedback, or the customer self-cancel.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";
import { sendTelegramMessage } from "../_shared/telegram.ts";
import { deliveryWhenKa, isTbilisiCity, parseSmsSettings } from "../_shared/smsTemplates.ts";
import { loadSmsContext } from "../_shared/smsOrderContext.ts";
import { buildStages, CANCEL_REASONS_KA, firstName, isClosed, isHandedToCourier, needsAddress, plannedDateKa, streetOnly } from "./tracking.ts";

const json = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const RATE_WINDOW_MS = 10 * 60_000, RATE_MAX = 60;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("get"), token: z.string().regex(/^[0-9A-Za-z]{6}$/) }),
  z.object({ action: z.literal("change"), token: z.string().regex(/^[0-9A-Za-z]{6}$/), address: z.string().trim().max(300).optional(), day: z.string().trim().max(100).optional() }),
  z.object({ action: z.literal("call_me"), token: z.string().regex(/^[0-9A-Za-z]{6}$/), reason: z.string().max(40), text: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("cancel"), token: z.string().regex(/^[0-9A-Za-z]{6}$/), reason: z.string().max(40), text: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("set_address"), token: z.string().regex(/^[0-9A-Za-z]{6}$/), region_id: z.string().max(100), address: z.string().trim().min(3).max(300), name: z.string().trim().max(100).optional() }),
  z.object({ action: z.literal("rate_operator"), token: z.string().regex(/^[0-9A-Za-z]{6}$/), stars: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Rate limit per IP.
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const { count } = await db.from("tracking_rate_hits").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", since);
  if ((count ?? 0) >= RATE_MAX) return json({ error: "rate_limited" }, 429);
  await db.from("tracking_rate_hits").insert({ ip });
  if (Math.random() < 0.02) await db.from("tracking_rate_hits").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString());

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return json({ error: "invalid_request" }, 400);
  const b = parsed.data;

  const { data: o } = await db.from("orders")
    .select("id, public_order_number, customer_name, city, normalized_city, address_line1, normalized_address, is_tbilisi, total, status, is_confirmed, auto_confirmed, packed_at, onway_sent_at, onway_tracking, tracking_number, is_fulfilled, onway_planned_date, created_at, call_outcome, call_outcome_updated_at, call_outcome_updated_by, last_call_attempt_by, tracking_view_count, tracking_first_seen_at, address_status, skipped_address, shipping_fee, order_items(title, quantity, image_url, unit_price, sku)")
    .eq("tracking_token", b.token).maybeSingle();
  if (!o) return json({ error: "not_found" }, 404);
  const ctx = await loadSmsContext(db, { id: o.id });
  const store = ctx?.store ?? "TRENDMART";
  const tg = async (title: string, extra: string) => {
    const r = await sendTelegramMessage(`${title}\nშეკვეთა #${o.public_order_number}\n${extra}`);
    if (!r.ok) console.error("order-tracking telegram", r.status);
  };
  const handed = isHandedToCourier(o);

  if (b.action === "get") {
    const now = new Date().toISOString();
    await db.from("orders").update({ tracking_view_count: (o.tracking_view_count || 0) + 1, tracking_last_seen_at: now, tracking_first_seen_at: o.tracking_first_seen_at || now }).eq("id", o.id);

    const [{ data: evs }, { data: map }, { data: autoEv }, { data: settings }, { data: fb }, { data: review }] = await Promise.all([
      db.from("onway_status_events").select("status_id, event_time").eq("order_id", o.id),
      db.from("onway_status_map").select("status_id, action").in("action", ["out_for_delivery", "delivered"]),
      db.from("order_events").select("created_at").eq("order_id", o.id).in("event_type", ["auto_confirm", "status_change"]).order("created_at").limit(1),
      db.from("site_settings").select("key, value").in("key", ["sms_sequence", "logo_url_trendmart", "logo_url_bigmart"]),
      db.from("customer_feedback").select("stars").eq("order_id", o.id).eq("kind", "operator_call").maybeSingle(),
      db.from("product_review_requests").select("token, consumed_at").eq("order_id", o.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const actionOf = Object.fromEntries((map || []).map((m: any) => [m.status_id, m.action]));
    const firstAt = (a: string) => (evs || []).filter((e: any) => actionOf[e.status_id] === a).map((e: any) => e.event_time).sort()[0] ?? null;
    const confirmedAt = o.call_outcome === "confirmed" ? o.call_outcome_updated_at : (o.auto_confirmed ? autoEv?.[0]?.created_at ?? null : null);
    const stages = buildStages(o, { confirmedAt, outForDeliveryAt: firstAt("out_for_delivery"), deliveredAt: firstAt("delivered") });
    const s = Object.fromEntries((settings || []).map((r: any) => [r.key, r.value]));
    const isTbs = isTbilisiCity(o.normalized_city || o.city, o.is_tbilisi);
    const deliveryText = o.onway_planned_date ? plannedDateKa(o.onway_planned_date) : deliveryWhenKa(confirmedAt ? new Date(confirmedAt) : new Date(), isTbs);

    // Product review hand-off (camera review flow) once delivered.
    let reviewUrlToken: string | null = null;
    const hasCamera = (o.order_items || []).some((i: any) => i.sku === "002");
    if (o.status === "delivered" && hasCamera) {
      if (review && !review.consumed_at) reviewUrlToken = review.token;
      else if (!review) {
        const { data: r } = await db.from("product_review_requests").insert({ order_id: o.id, product_sku: "002" }).select("token").maybeSingle();
        reviewUrlToken = r?.token ?? null;
      }
    }
    return json({
      number: o.public_order_number, store, logo: store === "BIGMART" ? s.logo_url_bigmart ?? null : s.logo_url_trendmart ?? null,
      first_name: firstName(o.customer_name), city: o.normalized_city || o.city || null, street: streetOnly(o.normalized_address || o.address_line1),
      is_tbilisi: isTbs, total: Number(o.total || 0), delivery_text: deliveryText, planned_date: o.onway_planned_date ?? null,
      items: (o.order_items || []).map((i: any) => ({ title: i.title, qty: i.quantity, image: i.image_url })),
      stages, handed, closed: isClosed(o), status: o.status === "delivered" ? "delivered" : isClosed(o) ? "canceled" : "active",
      can_cancel: !handed && !isClosed(o) && o.status !== "delivered",
      operator_phone: parseSmsSettings(s.sms_sequence).num1 || null,
      can_rate_operator: !fb && o.call_outcome === "confirmed" && o.auto_confirmed !== true && o.status !== "delivered" && !isClosed(o),
      rated: !!fb, review_token: reviewUrlToken,
      confirmed: stages[1]?.done === true, needs_address: needsAddress(o), shipping_fee: Number(o.shipping_fee || 0),
    });
  }

  if (isClosed(o)) return json({ error: "closed" }, 409);

  if (b.action === "change") {
    if (!b.address && !b.day) return json({ error: "empty" }, 400);
    const kind = b.address ? "change_address" : "change_day";
    await db.from("customer_requests").insert({ order_id: o.id, kind, payload: { address: b.address ?? null, day: b.day ?? null } });
    await tg("📝 კლიენტი ითხოვს ცვლილებას", `${b.address ? `ახალი მისამართი: ${b.address}\n` : ""}${b.day ? `სასურველი დღე: ${b.day}` : ""}`);
    return json({ ok: true });
  }

  if (b.action === "set_address") {
    if (!needsAddress(o)) return json({ error: "address_exists" }, 409);
    const { data: region } = await db.from("onway_regions").select("id, name").eq("id", b.region_id).eq("active", true).maybeSingle();
    if (!region) return json({ error: "invalid_city" }, 400);
    const patch: Record<string, unknown> = {
      city: region.name, region: region.name, raw_city: region.name, address_line1: b.address, raw_address: b.address,
      is_tbilisi: region.id === "1", address_status: "completed", address_added_at: new Date().toISOString(), skipped_address: false,
    };
    if (["pending_details", "pending_address"].includes(String(o.status))) patch.status = "new";
    if (b.name) patch.customer_name = b.name;
    const { error } = await db.from("orders").update(patch).eq("id", o.id);
    if (error) return json({ error: "save_failed" }, 500);
    await db.from("order_events").insert({ order_id: o.id, actor: "customer", event_type: "address_added", payload: { source: "tracking_page", note: "customer added address via tracking page", city: region.name, name_changed: !!b.name } });
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/normalize-and-score`, { method: "POST", headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` }, body: JSON.stringify({ order_id: o.id }) }).catch((e) => console.error("normalize", e));
    return json({ ok: true });
  }

  if (b.action === "call_me") {
    await db.from("customer_requests").insert({ order_id: o.id, kind: "cancel_save", priority: true, payload: { reason: b.reason, text: b.text ?? null } });
    await tg("📞 გაუქმებას აპირებს — დაურეკე!", `მიზეზი: ${CANCEL_REASONS_KA[b.reason] || b.reason}${b.text ? `\n${b.text}` : ""}`);
    return json({ ok: true });
  }

  if (b.action === "cancel") {
    if (handed) return json({ error: "handed_to_courier" }, 409);
    const reason = `customer_self:${b.reason}`;
    const { data: upd, error } = await db.from("orders").update({
      status: "canceled", is_confirmed: false, final_cancel_reason: reason, final_cancel_note: b.text ?? null,
      call_outcome: "cancelled", operator_review_status: "cancelled", call_outcome_updated_at: new Date().toISOString(), call_outcome_updated_by: "customer",
    }).eq("id", o.id).is("onway_sent_at", null).not("status", "in", "(canceled,shipped,delivered,merged,returned,archived)").select("id").maybeSingle();
    if (error || !upd) return json({ error: "cancel_failed" }, 409);
    await db.rpc("apply_order_cancel_stock_core", { p_order_id: o.id, p_restore: true, p_actor: null, p_actor_email: "customer (tracking page)" });
    await db.from("order_events").insert({ order_id: o.id, actor: "customer", event_type: "order_canceled", payload: { reason, note: b.text ?? null, source: "tracking_page" } });
    await db.from("customer_requests").insert({ order_id: o.id, kind: "self_canceled", payload: { reason: b.reason, text: b.text ?? null } });
    await tg("❌ კლიენტმა თვითონ გააუქმა", `მიზეზი: ${CANCEL_REASONS_KA[b.reason] || b.reason}${b.text ? `\n${b.text}` : ""}`);
    return json({ ok: true });
  }

  if (b.action === "rate_operator") {
    if (o.call_outcome !== "confirmed" || o.auto_confirmed === true) return json({ error: "not_ratable" }, 409);
    const { error } = await db.from("customer_feedback").insert({
      order_id: o.id, kind: "operator_call", operator: o.call_outcome_updated_by || o.last_call_attempt_by || null, stars: b.stars, comment: b.comment || null,
    });
    if (error) return json({ error: error.code === "23505" ? "already_rated" : "failed" }, 409);
    return json({ ok: true });
  }
  return json({ error: "invalid_request" }, 400);
});
