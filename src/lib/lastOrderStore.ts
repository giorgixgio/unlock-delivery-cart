import { trackEvent } from "@/lib/analytics";

const TTL_MS = 24 * 60 * 60 * 1000;

export interface LastOrderRecord {
  orderNumber: string;
  sku: string;
  productName: string;
  phone: string;
  createdAt: number;
}

const key = (sku: string) => `lastOrder:${sku}`;

export function saveLastOrder(rec: LastOrderRecord) {
  if (!rec.sku) return;
  try {
    localStorage.setItem(key(rec.sku), JSON.stringify(rec));
  } catch {}
}

export function readLastOrder(sku: string): LastOrderRecord | null {
  if (!sku) return null;
  try {
    const raw = localStorage.getItem(key(sku));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastOrderRecord;
    if (!parsed?.createdAt || Date.now() - parsed.createdAt > TTL_MS) {
      localStorage.removeItem(key(sku));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearLastOrder(sku: string) {
  try { localStorage.removeItem(key(sku)); } catch {}
}

/** Session-scoped intentional-repeat flag (per sku). */
const repeatKey = (sku: string) => `intentionalRepeat:${sku}`;
export function markIntentionalRepeat(sku: string) {
  try { sessionStorage.setItem(repeatKey(sku), "1"); } catch {}
  trackEvent("intentional_repeat_clicked", { sku });
}
export function consumeIntentionalRepeat(sku: string): boolean {
  try {
    const v = sessionStorage.getItem(repeatKey(sku));
    return v === "1";
  } catch { return false; }
}
