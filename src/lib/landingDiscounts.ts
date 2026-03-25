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

/** Returns the discount percentage for a given quantity (0, 20, or 35). */
export function getQtyDiscountPct(qty: number): number {
  return DISCOUNT_MAP[qty] ?? 0;
}

/** Returns the discounted total for a given base price and quantity. */
export function getDiscountedTotal(basePrice: number, qty: number): number {
  const pct = getQtyDiscountPct(qty);
  const raw = basePrice * qty * (1 - pct / 100);
  return Math.round(raw * 100) / 100;
}

/** Returns the undiscounted (original) total. */
export function getOriginalTotal(basePrice: number, qty: number): number {
  return Math.round(basePrice * qty * 100) / 100;
}
