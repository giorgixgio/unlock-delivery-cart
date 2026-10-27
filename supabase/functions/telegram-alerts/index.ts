// Sends Telegram alerts to the owner via the connector gateway:
//  - "order_created": fired by the notify_telegram_new_order() database trigger
//  - "low_stock_run": fired by the telegram-low-stock pg_cron job
// Every request must carry the internal secret stored in site_settings
// (key: telegram_alert_secret) so nobody can forge alerts.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { readSetting, serviceDb, sendTelegramMessage } from "../_shared/telegram.ts";

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
  const isLead = order.status === "pending_details";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = serviceDb();
  const secret = await readSetting(db, "telegram_alert_secret");
  if (!secret || req.headers.get("x-internal-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  let body: { type?: string; order_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (body.type === "order_created" && body.order_id) return handleNewOrder(db, body.order_id);
  if (body.type === "low_stock_run") return handleLowStock(db);
  return json({ error: "Unknown type" }, 400);
});
