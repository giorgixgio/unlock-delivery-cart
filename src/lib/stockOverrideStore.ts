/**
 * Reactive stock override store.
 * Uses localStorage for persistence and a global event emitter
 * so ALL components (admin + shop) see changes instantly.
 */

const STORAGE_KEY = "bigmart-stock-overrides";

type Listener = () => void;
const listeners = new Set<Listener>();

let currentOverrides: Record<string, boolean> = loadFromStorage();

function loadFromStorage(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function emitChange() {
  listeners.forEach((fn) => fn());
}

export function getStockOverrides(): Record<string, boolean> {
  return currentOverrides;
}

export function setStockOverride(productId: string, available: boolean) {
  currentOverrides = { ...currentOverrides, [productId]: available };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOverrides));
  emitChange();
}

export function clearStockOverride(productId: string) {
  const next = { ...currentOverrides };
  delete next[productId];
  currentOverrides = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentOverrides));
  emitChange();
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
