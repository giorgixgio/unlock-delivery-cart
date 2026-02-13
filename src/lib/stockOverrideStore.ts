/**
 * DB-backed reactive stock override store.
 * Reads from `product_stock_overrides` table.
 * Uses Supabase Realtime for instant updates across all clients.
 * Falls back to localStorage cache for offline/initial render.
 */

import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "bigmart-stock-overrides";

type Listener = () => void;
const listeners = new Set<Listener>();

let currentOverrides: Record<string, boolean> = loadFromStorage();
let initialized = false;

function loadFromStorage(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function persistToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOverrides));
  } catch {}
}

function emitChange() {
  listeners.forEach((fn) => fn());
}

export function getStockOverrides(): Record<string, boolean> {
  return currentOverrides;
}

/** Check if a specific product is out of stock */
export function isProductOOS(productId: string, fallbackAvailable?: boolean): boolean {
  if (currentOverrides[productId] !== undefined) {
    return !currentOverrides[productId];
  }
  return fallbackAvailable === false;
}

/**
 * Admin: set stock override in DB.
 * Writes to Supabase, which triggers realtime → all clients update.
 */
export async function setStockOverride(productId: string, available: boolean) {
  // Optimistic update
  currentOverrides = { ...currentOverrides, [productId]: available };
  persistToStorage();
  emitChange();

  // Write to DB
  const { error } = await supabase
    .from("product_stock_overrides")
    .upsert(
      { product_id: productId, available, updated_at: new Date().toISOString(), updated_by: "admin" },
      { onConflict: "product_id" }
    );

  if (error) {
    console.error("Failed to save stock override:", error);
  }
}

/**
 * Admin: clear stock override (revert to Shopify's value).
 */
export async function clearStockOverride(productId: string) {
  const next = { ...currentOverrides };
  delete next[productId];
  currentOverrides = next;
  persistToStorage();
  emitChange();

  await supabase
    .from("product_stock_overrides")
    .delete()
    .eq("product_id", productId);
}

export function subscribeOverrides(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply overrides to a product array (pure function) */
export function applyOverrides(products: readonly { id: string; available: boolean }[]): any[] {
  const overrides = currentOverrides;
  if (Object.keys(overrides).length === 0) return products as any[];
  return (products as any[]).map((p) =>
    overrides[p.id] !== undefined ? { ...p, available: overrides[p.id] } : p
  );
}

/**
 * Fetch all overrides from DB and start realtime subscription.
 * Called once on app startup.
 */
export async function initStockOverrides() {
  if (initialized) return;
  initialized = true;

  // Fetch current state from DB
  try {
    const { data, error } = await supabase
      .from("product_stock_overrides")
      .select("product_id, available");

    if (!error && data) {
      const dbOverrides: Record<string, boolean> = {};
      for (const row of data) {
        dbOverrides[row.product_id] = row.available;
      }
      currentOverrides = dbOverrides;
      persistToStorage();
      emitChange();
    }
  } catch (e) {
    console.warn("Failed to fetch stock overrides from DB, using localStorage cache:", e);
  }

  // Subscribe to realtime changes
  supabase
    .channel("stock-overrides-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "product_stock_overrides" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { product_id?: string };
          if (old.product_id) {
            const next = { ...currentOverrides };
            delete next[old.product_id];
            currentOverrides = next;
          }
        } else {
          const row = payload.new as { product_id: string; available: boolean };
          currentOverrides = { ...currentOverrides, [row.product_id]: row.available };
        }
        persistToStorage();
        emitChange();
      }
    )
    .subscribe();
}
