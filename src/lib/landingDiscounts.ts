/**
 * Quantity-based discount logic for /p/... landing pages.
 * 
 * Rules:
 *   1 qty = base price (no discount)
 *   2 qty = 20% off total
 *   3 qty = 35% off total
 */

const DISCOUNT_MAP: Record<number, number> = {
  1: 0,
  2: 20,
  3: 35,
};

// Per-SKU discount overrides (softer rates for specific landing pages).
const SKU_DISCOUNT_OVERRIDES: Record<string, Record<number, number>> = {
  "002": { 1: 0, 2: 10, 3: 15 },
};

/** Returns the discount percentage for a given quantity (0, 20, or 35; per-SKU override if set). */
export function getQtyDiscountPct(qty: number, sku?: string): number {
  const map = (sku && SKU_DISCOUNT_OVERRIDES[String(sku)]) || DISCOUNT_MAP;
  return map[qty] ?? 0;
}

/** Returns the discounted total for a given base price and quantity. */
export function getDiscountedTotal(basePrice: number, qty: number, sku?: string): number {
  const pct = getQtyDiscountPct(qty, sku);
  const raw = basePrice * qty * (1 - pct / 100);
  return Math.round(raw * 100) / 100;
}

/** Returns the undiscounted (original) total. */
export function getOriginalTotal(basePrice: number, qty: number): number {
  return Math.round(basePrice * qty * 100) / 100;
}
