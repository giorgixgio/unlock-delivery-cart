import { supabase } from "@/integrations/supabase/client";
import type { AdminStore } from "@/contexts/StoreContext";

const CHUNK_SIZE = 400;
let productWarehousePromise: Promise<Map<string, "A" | "B">> | null = null;
let productWarehouseLoadedAt = 0;
const PRODUCT_WAREHOUSE_CACHE_MS = 60_000;

const chunks = <T,>(rows: T[], size = CHUNK_SIZE) =>
  Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));

async function getProductWarehouseMap() {
  if (Date.now() - productWarehouseLoadedAt > PRODUCT_WAREHOUSE_CACHE_MS) {
    productWarehousePromise = null;
  }
  if (!productWarehousePromise) {
    productWarehousePromise = (async () => {
      const map = new Map<string, "A" | "B">();
      let from = 0;
      while (true) {
        const { data, error } = await (supabase.from("products") as any)
          .select("id, sku, warehouse")
          .range(from, from + 999);
        if (error) throw error;
        for (const row of data ?? []) {
          const warehouse = row.warehouse === "A" ? "A" : "B";
          if (row.id) map.set(`id:${row.id}`, warehouse);
          if (row.sku) map.set(`sku:${String(row.sku).trim().toLowerCase()}`, warehouse);
        }
        if (!data || data.length < 1000) break;
        from += 1000;
      }
      productWarehouseLoadedAt = Date.now();
      return map;
    })().catch((error) => {
      productWarehousePromise = null;
      throw error;
    });
  }
  return productWarehousePromise;
}

export function invalidateAdminStoreProductMap() {
  productWarehousePromise = null;
  productWarehouseLoadedAt = 0;
}

export async function getOrderIdsForStore(orderIds: string[], store: AdminStore): Promise<Set<string>> {
  if (store === "ALL") return new Set(orderIds);
  if (orderIds.length === 0) return new Set();
  const warehouseMap = await getProductWarehouseMap();
  const matched = new Set<string>();
  for (const batch of chunks(orderIds)) {
    const { data, error } = await (supabase.from("order_items") as any)
      .select("order_id, product_id, sku")
      .in("order_id", batch);
    if (error) throw error;
    const seen = new Set<string>();
    for (const item of data ?? []) {
      seen.add(item.order_id);
      const warehouse = warehouseMap.get(`id:${item.product_id}`)
        ?? warehouseMap.get(`sku:${String(item.sku ?? "").trim().toLowerCase()}`)
        ?? "B";
      if (warehouse === store) matched.add(item.order_id);
    }
    if (store === "B") {
      for (const id of batch) if (!seen.has(id)) matched.add(id);
    }
  }
  return matched;
}

export async function filterOrdersForStore<T extends { id: string }>(rows: T[], store: AdminStore): Promise<T[]> {
  if (store === "ALL") return rows;
  const ids = await getOrderIdsForStore(rows.map((row) => row.id), store);
  return rows.filter((row) => ids.has(row.id));
}