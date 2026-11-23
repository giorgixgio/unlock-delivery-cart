import { createClient } from "npm:@supabase/supabase-js@2";
import { normalizeGePhone, senderApiKey, sendSms } from "../_shared/senderGe.ts";
import { trackingLink, applyQuietHours } from "../_shared/smsTemplates.ts";
import { isTestOrder } from "../_shared/testOrders.ts";
import { loadSmsContext } from "../_shared/smsOrderContext.ts";

// One-off Giorgoba (Nov 23 2026) message to parcels currently with the courier. Expires end of day.
const CAMPAIGN = "campaign_giorgoba_20261123";
const EXPIRES = Date.parse("2026-11-23T16:00:00Z");
const text = (link: string, brand: string) =>
  `გილოცავთ გიორგობას! თქვენი ამანათი გზაშია და ხვალ მოგიტანთ. გადახდა კურიერთან, მიღებისას. გთხოვთ, იყავით ხელმისაწვდომი. თვალყური: ${link.replace(/^https?:\/\//, "")} ${brand}`;
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: secret } = await db.from("internal_job_secrets").select("value").eq("name", "sms_queue").maybeSingle();
  if (!secret?.value || req.headers.get("x-cron-secret") !== secret.value) return json({ error: "Unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const now = new Date();
  if (body.send === true && now.getTime() > EXPIRES) return json({ error: "campaign_expired" }, 409);
  if (body.send === true && applyQuietHours(now).getTime() !== now.getTime()) return json({ error: "quiet_hours" }, 409);
  const ships: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("courier_shipments").select("original_order_id")
      .eq("is_return", false).in("derived_state", ["IN_PROGRESS", "FAILED_ATTEMPT"]).not("original_order_id", "is", null).range(from, from + 999);
    if (error) return json({ error: error.message }, 500);
    ships.push(...data); if (data.length < 1000) break;
  }
  const ids = [...new Set(ships.map(s => s.original_order_id))];
  const orders: any[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("orders").select("*, order_items(sku,product_id)").in("id", ids.slice(i, i + 200));
    if (error) return json({ error: error.message }, 500);
    orders.push(...data);
  }
  const { data: logs } = await db.from("sms_logs").select("phone").eq("type", CAMPAIGN);
  const seen = new Set((logs || []).map(l => l.phone));
  const cands = orders.filter(o => !isTestOrder(o) && o.status !== "cancelled" && !o.merged_into_order_id && o.tracking_token).filter(o => {
    const p = normalizeGePhone(o.customer_phone); if (!p || seen.has(p)) return false; seen.add(p); return true;
  });
  if (body.send !== true) return json({ remaining: cands.length, logged: logs?.length || 0 });
  const apiKey = senderApiKey(); if (!apiKey) return json({ error: "SMS not configured" }, 500);
  const stats = { sent: 0, failed: 0, skipped: 0, remaining: cands.length };
  const deadline = Date.now() + 100_000;
  for (const o of cands.slice(0, 120)) {
    if (Date.now() > deadline) break;
    const ctx = await loadSmsContext(db, { id: o.id });
    if (!ctx || ctx.isTest) { stats.skipped++; continue; }
    const store = ctx.store;
    const link = trackingLink(store as any, o.tracking_token); const phone = normalizeGePhone(o.customer_phone);
    if (!link || !phone) { stats.skipped++; continue; }
    const id = crypto.randomUUID();
    const content = text(link, store === "BIGMART" ? "BigMart" : "TrendMart");
    const { error: ie } = await db.from("sms_logs").insert({ id, order_number: o.public_order_number, phone, type: CAMPAIGN, sender: "sender.ge", provider: "sender.ge", content, status: "pending", attempts: 1 });
    if (ie) { stats.skipped++; continue; }
    const r = await sendSms(apiKey, phone, content);
    await db.from("sms_logs").update({ status: r.status, error_code: r.httpStatus, api_message: r.apiMessage, message_id: r.messageId, segments: r.segments, attempts: r.attempts, delivery_status: r.status === "sent" ? "pending" : null }).eq("id", id);
    stats[r.status === "sent" ? "sent" : r.status === "skipped" ? "skipped" : "failed"]++;
    if (r.status === "failed") break;
  }
  return json(stats);
});
