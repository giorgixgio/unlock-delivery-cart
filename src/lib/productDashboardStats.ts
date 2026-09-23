/**
 * Pure aggregation for the dashboard "Products — Leads & Confirm Rate" section.
 * Cohort rules mirror AdminDashboard: orders created in period, no returns, no merged.
 */
import { tbilisiDayKey } from "@/lib/tbilisiTime";

export interface PdsOrder {
  id: string;
  status: string;
  is_confirmed: boolean | null;
  is_fulfilled: boolean | null;
  auto_confirmed: boolean | null;
  is_return?: boolean | null;
  created_at: string;
}
export interface PdsItem {
  order_id: string;
  product_id: string | null;
  sku: string | null;
  title: string | null;
  image_url: string | null;
  quantity: number | null;
  line_total: number | null;
}
export interface PdsAddedEvent {
  order_id: string;
  payload: { product_id?: string | null; sku?: string | null } | null;
}

export interface ProductDay { day: string; leads: number; confirmed: number }
export interface ProductStat {
  key: string;
  productId: string | null;
  sku: string;
  title: string;
  image: string;
  leads: number;
  confirmed: number;
  canceled: number;
  pending: number;
  revenue: number;
  autoConfirmed: number;
  upsold: number;
  confirmRate: number; // 0..1
  autoShare: number; // 0..1 among confirmed
  daily: ProductDay[];
}
export interface ProductSummary {
  uniqueLeads: number;
  confirmed: number;
  confirmRate: number;
  productsWithLeads: number;
  best: ProductStat | null;
  worst: ProductStat | null;
}

export const LOW_SAMPLE = 5;

export const isCanceled = (o: PdsOrder) => o.status === "canceled" || o.status === "returned";
export const isConfirmed = (o: PdsOrder) => !!(o.is_confirmed || o.is_fulfilled) && !isCanceled(o);
export const isRealOrder = (o: PdsOrder) => o.status !== "merged" && !o.is_return;

const norm = (v: string | null | undefined) => String(v ?? "").trim().toLowerCase();
export const productKey = (i: { product_id?: string | null; sku?: string | null }) =>
  i.product_id ? `p:${i.product_id}` : `s:${norm(i.sku)}`;

/** Set of "orderId|p:id" and "orderId|s:sku" keys for operator-added items. */
export function buildAddedIndex(events: PdsAddedEvent[]): Set<string> {
  const s = new Set<string>();
  for (const e of events) {
    if (e.payload?.product_id) s.add(`${e.order_id}|p:${e.payload.product_id}`);
    if (e.payload?.sku) s.add(`${e.order_id}|s:${norm(e.payload.sku)}`);
  }
  return s;
}

const isOperatorAdded = (i: PdsItem, added: Set<string>) =>
  (!!i.product_id && added.has(`${i.order_id}|p:${i.product_id}`)) ||
  (!!i.sku && added.has(`${i.order_id}|s:${norm(i.sku)}`));

export function aggregateProductStats(orders: PdsOrder[], items: PdsItem[], events: PdsAddedEvent[]) {
  const real = new Map(orders.filter(isRealOrder).map((o) => [o.id, o]));
  const added = buildAddedIndex(events);
  const map = new Map<string, ProductStat & { _orders: Set<string>; _upsold: Set<string>; _days: Map<string, ProductDay> }>();
  const get = (i: PdsItem) => {
    const key = productKey(i);
    let p = map.get(key);
    if (!p) {
      p = {
        key, productId: i.product_id, sku: i.sku || "", title: i.title || i.sku || "—", image: i.image_url || "",
        leads: 0, confirmed: 0, canceled: 0, pending: 0, revenue: 0, autoConfirmed: 0, upsold: 0,
        confirmRate: 0, autoShare: 0, daily: [], _orders: new Set(), _upsold: new Set(), _days: new Map(),
      };
      map.set(key, p);
    }
    return p;
  };
  const leadOrders = new Set<string>();
  for (const i of items) {
    const o = real.get(i.order_id);
    if (!o) continue;
    const p = get(i);
    if (isOperatorAdded(i, added)) { p._upsold.add(o.id); continue; }
    if (!isCanceled(o)) p.revenue += Number(i.line_total || 0);
    if (p._orders.has(o.id)) continue; // same product twice in one order = one lead
    p._orders.add(o.id);
    leadOrders.add(o.id);
    p.leads++;
    const conf = isConfirmed(o);
    if (conf) { p.confirmed++; if (o.auto_confirmed) p.autoConfirmed++; }
    else if (isCanceled(o)) p.canceled++;
    else p.pending++;
    const day = tbilisiDayKey(o.created_at);
    const d = p._days.get(day) ?? { day, leads: 0, confirmed: 0 };
    d.leads++; if (conf) d.confirmed++;
    p._days.set(day, d);
  }
  const products: ProductStat[] = [];
  for (const p of map.values()) {
    if (p.leads === 0 && p._upsold.size === 0) continue;
    const { _orders, _upsold, _days, ...rest } = p;
    products.push({
      ...rest,
      upsold: _upsold.size,
      confirmRate: p.leads ? p.confirmed / p.leads : 0,
      autoShare: p.confirmed ? p.autoConfirmed / p.confirmed : 0,
      daily: [..._days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    });
  }
  const withLeads = products.filter((p) => p.leads > 0);
  // Summary uses UNIQUE real orders so the total equals the dashboard's Total Real Orders.
  const cohort = [...real.values()];
  const confirmed = cohort.filter(isConfirmed).length;
  const eligible = withLeads.filter((p) => p.leads >= LOW_SAMPLE);
  const byRate = [...eligible].sort((a, b) => b.confirmRate - a.confirmRate || b.leads - a.leads);
  const summary: ProductSummary = {
    uniqueLeads: cohort.length,
    confirmed,
    confirmRate: cohort.length ? confirmed / cohort.length : 0,
    productsWithLeads: withLeads.length,
    best: byRate[0] ?? null,
    worst: byRate.length > 1 ? byRate[byRate.length - 1] : null,
  };
  return { products: withLeads.concat(products.filter((p) => p.leads === 0)), summary, leadOrderCount: leadOrders.size };
}

export type ProductSort = "leads" | "rate" | "revenue";
export function sortProducts(list: ProductStat[], by: ProductSort) {
  return [...list].sort((a, b) =>
    by === "rate" ? b.confirmRate - a.confirmRate || b.leads - a.leads
      : by === "revenue" ? b.revenue - a.revenue
        : b.leads - a.leads || b.confirmed - a.confirmed);
}
