/**
 * Stock quantity helpers (admin only).
 *
 * All writes go through security-definer RPCs so every change is written to
 * `stock_activity_log` — never update `products.stock_quantity` directly.
 */

import { supabase } from "@/integrations/supabase/client";

export interface StockLogEntry {
  id: string;
  product_id: string | null;
  changed_by: string | null;
  changed_by_email: string | null;
  change_type: "manual_set" | "manual_adjust" | "order_confirm" | "order_cancel_restore";
  delta: number;
  previous_value: number | null;
  new_value: number | null;
  comment: string | null;
  order_id: string | null;
  created_at: string;
}

/** Manual adjustment: exact value or signed delta. Returns the new stock value. */
export async function adjustProductStock(
  productId: string,
  mode: "set" | "adjust",
  value: number,
  comment?: string,
): Promise<number> {
  const { data, error } = await (supabase as any).rpc("adjust_product_stock", {
    p_product_id: productId,
    p_mode: mode,
    p_value: Math.trunc(value),
    p_comment: comment?.trim() || null,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return Number(row?.new_value ?? 0);
}

/** Decrement stock for every line item of a confirmed order (runs once per order). */
export async function applyOrderConfirmStock(orderId: string): Promise<void> {
  const { error } = await (supabase as any).rpc("apply_order_confirm_stock", { p_order_id: orderId });
  if (error) console.error("apply_order_confirm_stock failed", error);
}

/**
 * Cancel handling. Restores stock when `restore` is true; otherwise only logs
 * the operator's choice. No-op when the order never decremented stock.
 */
export async function applyOrderCancelStock(orderId: string, restore: boolean): Promise<void> {
  const { error } = await (supabase as any).rpc("apply_order_cancel_stock", {
    p_order_id: orderId,
    p_restore: restore,
  });
  if (error) console.error("apply_order_cancel_stock failed", error);
}

/** Current stock per product id. */
export async function fetchStockQuantities(): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  const PAGE = 1000;
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .range(from, from + PAGE - 1);
    if (error) break;
    for (const row of data || []) map[(row as any).id] = Number((row as any).stock_quantity ?? 0);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return map;
}

async function sumQuantitiesForOrders(orderIds: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const CHUNK = 150;
  const chunks: string[][] = [];
  for (let i = 0; i < orderIds.length; i += CHUNK) chunks.push(orderIds.slice(i, i + CHUNK));
  let next = 0;
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      const { data: items } = await supabase
        .from("order_items")
        .select("product_id, quantity")
        .in("order_id", chunk)
        .limit(5000);
      for (const it of items || []) {
        const pid = (it as any).product_id as string;
        if (!pid) continue;
        result[pid] = (result[pid] || 0) + Number((it as any).quantity || 0);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return result;
}

/**
 * Quantities committed to orders that are confirmed (not yet fulfilled) OR
 * already shipped but not yet delivered — stock that is spoken for.
 * Computed live, never stored.
 */
export async function fetchReservedQuantities(): Promise<Record<string, number>> {
  const reserved: Record<string, number> = {};
  const PAGE = 1000;
  const ids: string[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("is_return", false)
      .not("status", "in", '("canceled","cancelled","merged","delivered")')
      .or("and(is_confirmed.eq.true,is_fulfilled.eq.false),status.eq.shipped")
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    ids.push(...data.map((o: any) => o.id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (!ids.length) return reserved;
  return sumQuantitiesForOrders(ids);
}

/**
 * Quantities in orders still under review: not confirmed, not canceled,
 * not merged — the pipeline an operator may still confirm.
 */
export async function fetchPendingQuantities(): Promise<Record<string, number>> {
  const PAGE = 1000;
  const ids: string[] = [];
  let from = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .eq("is_confirmed", false)
      .eq("is_fulfilled", false)
      .eq("is_return", false)
      .not("status", "in", '("canceled","cancelled","merged","delivered","shipped")')
      .range(from, from + PAGE - 1);
    if (error || !data?.length) break;
    ids.push(...data.map((o: any) => o.id));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  if (!ids.length) return {};
  return sumQuantitiesForOrders(ids);
}

export async function fetchStockLog(productId: string, limit = 50): Promise<StockLogEntry[]> {
  const { data, error } = await (supabase as any)
    .from("stock_activity_log")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []) as StockLogEntry[];
}
