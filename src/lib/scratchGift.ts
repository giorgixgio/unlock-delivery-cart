import type { CartItem, Product } from "@/lib/constants";
import { isTestSku } from "@/lib/testProducts";

/** Scratch-card "+1 free unit" promo — wood disc landing only. */
export const SCRATCH_GIFT_SKU = "G888-T4656-0012_4";
export const SCRATCH_PROMO = "scratch_0012_4";
export const SCRATCH_REVEALED_KEY = "promo_0012_4_revealed";
export const SCRATCH_ACTIVE_KEY = "promo_0012_4_activated";

/** Only the real wood disc SKU; test SKUs never get the gift. */
export function scratchGiftEligible(sku?: string | null): boolean {
  return String(sku ?? "") === SCRATCH_GIFT_SKU && !isTestSku(sku);
}

/** Paid line at the chosen qty + (when active) a separate 1-unit 0 ₾ gift line of the same SKU. */
export function buildScratchGiftItems(product: Product, quantity: number, giftActive: boolean): CartItem[] {
  const items: CartItem[] = [{ product, quantity }];
  if (giftActive && scratchGiftEligible(product.sku)) items.push({ product: { ...product, price: 0 }, quantity: 1, isGift: true });
  return items;
}

export const unitsToPack = (items: { quantity: number }[]) => items.reduce((s, i) => s + Number(i.quantity || 0), 0);
export const itemsRevenue = (items: CartItem[]) => items.reduce((s, i) => s + (i.isGift ? 0 : i.product.price * i.quantity), 0);

export interface ItemLike { sku?: string | null; title?: string | null; quantity?: number | null; is_gift?: boolean | null }
export interface ItemGroup { sku: string; title: string; paid: number; gift: number; total: number }

/** Merge rows by SKU, keeping paid vs gift units apart. */
export function groupGiftItems(items: ItemLike[] | null | undefined): ItemGroup[] {
  const m = new Map<string, ItemGroup>();
  for (const i of items || []) {
    const sku = String(i.sku ?? "");
    const g = m.get(sku) ?? { sku, title: String(i.title ?? sku), paid: 0, gift: 0, total: 0 };
    const q = Number(i.quantity || 1);
    if (i.is_gift) g.gift += q; else g.paid += q;
    g.total += q;
    m.set(sku, g);
  }
  return [...m.values()];
}

/** "ხის დისკი × 3 (2 + 1 🎁 საჩუქარი)" — plain "× n" when no gift. */
export const giftQtyLabel = (g: ItemGroup) => g.gift > 0 ? `× ${g.total} (${g.paid} + ${g.gift} 🎁 საჩუქარი)` : `× ${g.total}`;
export const itemSummary = (items: ItemLike[] | null | undefined) => groupGiftItems(items).map((g) => `${g.title} ${giftQtyLabel(g)}`).join(", ");
export const hasGiftLine = (items: ItemLike[] | null | undefined) => (items || []).some((i) => !!i.is_gift);

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };
export const readScratch = () => ({
  revealed: safe(() => localStorage.getItem(SCRATCH_REVEALED_KEY) === "1", false),
  active: safe(() => localStorage.getItem(SCRATCH_ACTIVE_KEY) === "1", false),
});
export const markScratchRevealed = () => safe(() => localStorage.setItem(SCRATCH_REVEALED_KEY, "1"), undefined);
export const activateScratchGift = () => safe(() => { localStorage.setItem(SCRATCH_REVEALED_KEY, "1"); localStorage.setItem(SCRATCH_ACTIVE_KEY, "1"); }, undefined);
