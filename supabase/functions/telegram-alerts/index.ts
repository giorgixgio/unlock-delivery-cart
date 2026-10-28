// Sends Telegram alerts to the owner via the connector gateway:
//  - "order_created": fired by the notify_telegram_new_order() database trigger
//  - "low_stock_run": fired by the telegram-low-stock pg_cron job
// Every request must carry the internal secret stored in site_settings
// (key: telegram_alert_secret) so nobody can forge alerts.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { readSetting, serviceDb, sendTelegramMessage } from "../_shared/telegram.ts";
import { z } from "npm:zod@3";
import { summaryWindow, formatOperatorSummary, type OperatorRow } from "./operatorSummary.ts";
import { isOwnerAlertEnabled } from "../_shared/telegramAlertPolicy.ts";

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type Order = {
  id: string;
  public_order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  address_line1: string;
  total: number;
  shipping_fee: number;
};

async function handleNewOrder(db: ReturnType<typeof serviceDb>, orderId: string) {
  const { data: order, error } = await db.from("orders").select(
    "id, public_order_number, status, customer_name, customer_phone, city, address_line1, total, shipping_fee",
  ).eq("id", orderId).maybeSingle<Order>();
  if (error) return json({ error: error.message }, 500);
  if (!order) return json({ error: "order not found", order_id: orderId }, 404);

  // A lead is created at the phone step with status "pending_details"; the
  // funnel later fills in the address on the same row. Label the two states.
  const isLead = true; // The INSERT trigger validates the original lead state, before later updates.
  let { data: items } = await db.from("order_items").select("title, quantity, line_total").eq("order_id", orderId);
  if (!items?.length) {
    // The storefront inserts items right after the order row; wait briefly so
    // the alert always shows the products.
    await new Promise((r) => setTimeout(r, 800));
    ({ data: items } = await db.from("order_items").select("title, quantity, line_total").eq("order_id", orderId));
  }
  const lines = (items ?? []).map((i) => `📦 ${i.quantity}× ${i.title}`).join("\n");
  const content =
    (isLead ? `🟡 ახალი ლიდი #${order.public_order_number}\n` : `🛒 ახალი შეკვეთა #${order.public_order_number}\n`) +
    `👤 ${order.customer_name}\n` +
    `📞 ${order.customer_phone}\n` +
    (isLead ? `📍 მისამართი: მომდევნო ნაბიჯზე\n` : `📍 ${order.city} — ${order.address_line1}\n`) +
    (lines ? `${lines}\n` : "") +
    `💰 ${Number(order.total).toFixed(2)} ₾ — გადახდა მიტანისას`;
  const sent = await sendTelegramMessage(content);
  return json({ type: "order_created", order_number: order.public_order_number, status: order.status, sent });
}

async function handleLowStock(db: ReturnType<typeof serviceDb>) {
  const threshold = Number(await readSetting(db, "telegram_low_stock_threshold", "50"));
  if (!Number.isFinite(threshold) || threshold <= 0) return json({ error: "invalid threshold" }, 400);

  const { data: products, error } = await db.from("products").select("id, sku, title, stock_quantity")
    .eq("available", true)
    .lte("stock_quantity", threshold)
    .not("sku", "ilike", "%GIFT%")
    .order("stock_quantity", { ascending: true })
    .limit(40);
  if (error) return json({ error: error.message }, 500);

  const { data: state } = await db.from("telegram_stock_alerts").select("product_id, alerted_at");
  const lastAlerted = new Map((state ?? []).map((s) => [s.product_id, new Date(s.alerted_at).getTime()]));
  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const toAlert = (products ?? []).filter((p) => {
    const t = lastAlerted.get(p.id);
    return !t || now - t > dayMs; // re-remind once per day while still low
  });

  if (!toAlert.length) return json({ type: "low_stock_run", low: products?.length ?? 0, sent: false, reason: "already alerted within 24h" });

  const lines = toAlert.slice(0, 15).map((p) => `• ${p.sku} — ${p.title}: ${p.stock_quantity} ც.`);
  const content =
    `📉 მარაგი იწურება (≤${threshold} ც.):\n${lines.join("\n")}` +
    (toAlert.length > 15 ? `\n…და კიდევ ${toAlert.length - 15} პროდუქტი` : "");
  const sent = await sendTelegramMessage(content);

  if (sent.ok) {
    const rows = toAlert.map((p) => ({ product_id: p.id, sku: p.sku, alerted_at: new Date().toISOString() }));
    await db.from("telegram_stock_alerts").upsert(rows, { onConflict: "product_id" });
  }
  return json({ type: "low_stock_run", alerted: toAlert.length, sent });
}

const BodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("order_created"), order_id: z.string().uuid() }),
  z.object({ type: z.literal("low_stock_run") }),
  z.object({ type: z.literal("operator_daily_summary"), dry_run: z.boolean().optional() }),
  z.object({ type: z.literal("bulk_fulfilled"), batch_id: z.string().uuid(), actor: z.string().max(255), dry_run: z.boolean().optional() }),
]);

async function handleOperatorSummary(db: ReturnType<typeof serviceDb>, dryRun = false) {
  const window = summaryWindow();
  const { data, error } = await db.rpc("telegram_operator_daily_stats", { p_from: window.from, p_to: window.to });
  if (error) return json({ error: error.message }, 500);
  const content = formatOperatorSummary(window.day, (data ?? []) as OperatorRow[], window.to);
  if (dryRun) return json({ content, rows: data, window });
  // Split at operator boundaries when approaching Telegram's 4096-character limit.
  const parts: string[] = []; let part = "";
  for (const block of content.split("\n\n")) {
    if ((part + block).length > 3800) { parts.push(part); part = ""; }
    part += (part ? "\n\n" : "") + block;
  }
  if (part) parts.push(part);
  for (const text of parts) {
    const sent = await sendTelegramMessage(text);
    if (!sent.ok) return json({ error: sent.error, status: sent.status }, 502);
  }
  return json({ type: "operator_daily_summary", sent: true, operators: data?.length ?? 0 });
}

async function handleBulkFulfilled(db: ReturnType<typeof serviceDb>, batchId: string, actor: string, dryRun = false) {
  const { data: batch, error } = await db.from("import_batches").select("file_name,total_rows,matched,unmatched,errors,status,applied_at,store").eq("id", batchId).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!batch || !["completed", "partial"].includes(batch.status)) return json({ error: "Batch is not finalized" }, 400);
  if (batch.store !== "B") return json({ sent: false, reason: "Not an Onway batch" });
  const { count, error: countError } = await db.from("import_staging_rows").select("id", { count: "exact", head: true }).eq("batch_id", batchId).eq("applied", true);
  if (countError) return json({ error: countError.message }, 500);
  const content = `📦 Onway — ხელით ატვირთვა დაფიქსირდა\n👤 ${actor}\n📄 ${batch.file_name ?? "Excel"}\n` +
    `✅ შესრულებული შეკვეთები: ${count ?? 0}\nფაილის რიგები: ${batch.total_rows} · დაუმთხვეველი: ${batch.unmatched}\n` +
    `⚠️ შეცდომები: ${batch.errors} · გამოტოვებული/კონფლიქტი: ${Math.max(0, batch.matched - (count ?? 0) - batch.errors)}\n` +
    `სტატუსი: ${batch.status === "partial" ? "ნაწილობრივ დასრულდა" : "დასრულდა"}`;
  if (dryRun) return json({ content, applied: count });
  const sent = await sendTelegramMessage(content);
  return json({ type: "bulk_fulfilled", sent }, sent.ok ? 200 : 502);
}

Deno.serve(async (req) => {
 try {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceDb();
  const secret = await readSetting(db, "telegram_alert_secret");
  if (!secret || req.headers.get("x-internal-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  let raw: unknown;
  try { raw = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
  const body = parsed.data;
  // Defense in depth: queued/legacy trigger requests must also stay quiet.
  if (!isOwnerAlertEnabled(body.type)) return json({ type: body.type, sent: false, reason: "disabled" });

  if (body.type === "order_created" && body.order_id) return handleNewOrder(db, body.order_id);
  if (body.type === "low_stock_run") return handleLowStock(db);
  if (body.type === "operator_daily_summary") return handleOperatorSummary(db, body.dry_run);
  if (body.type === "bulk_fulfilled") return handleBulkFulfilled(db, body.batch_id, body.actor, body.dry_run);
  return json({ error: "Unknown type" }, 400);
 } catch (error) {
   console.error("telegram-alerts failed", error);
   return json({ error: error instanceof Error ? error.message : "Alert failed" }, 500);
 }
});
