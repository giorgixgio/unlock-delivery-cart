// Loads everything a sequence SMS needs for one order (service-role client).
import { parseSmsSettings, type SmsSettings } from "./smsTemplates.ts";

export interface SmsOrderContext {
  order: any; store: "BIGMART" | "TRENDMART"; product: string | null; settings: SmsSettings;
}

export async function loadSmsContext(db: any, by: { id?: string; orderNumber?: string }): Promise<SmsOrderContext | null> {
  let q = db.from("orders").select("*, order_items(sku, product_id, unit_price, quantity, created_at)");
  q = by.id ? q.eq("id", by.id) : q.eq("public_order_number", by.orderNumber);
  const { data: order } = await q.maybeSingle();
  if (!order) return null;
  const items = [...(order.order_items || [])].sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));
  const skus = [...new Set(items.map((i: any) => String(i.sku || "")).filter(Boolean))];
  const prods: Record<string, any> = {};
  if (skus.length) {
    const { data } = await db.from("products").select("sku, sms_name, warehouse").in("sku", skus);
    for (const p of data || []) prods[String(p.sku)] = p;
  }
  // Same store rule as the courier export: any warehouse-B item => TrendMart.
  const store = !items.length || items.some((i: any) => String(prods[String(i.sku)]?.warehouse ?? "B").toUpperCase() !== "A") ? "TRENDMART" : "BIGMART";
  const paid = items.filter((i: any) => Number(i.unit_price) > 0);
  const first = paid[0] ?? items[0];
  const product = first ? (String(prods[String(first.sku)]?.sms_name || "").trim() || null) : null;
  const { data: s } = await db.from("site_settings").select("value").eq("key", "sms_sequence").maybeSingle();
  return { order, store, product, settings: parseSmsSettings(s?.value) };
}

export const STOPPED_STATUSES = new Set(["canceled", "cancelled", "returned", "archived", "merged"]);
