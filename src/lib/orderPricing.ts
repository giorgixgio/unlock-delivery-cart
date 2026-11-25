/** Standard courier shipping fee on landing and bundle orders (GEL). */
export const STANDARD_SHIPPING_FEE = 6;

/** Orders at or above this total (GEL) round down and may sacrifice 1 GEL to hit a clean 5-GEL boundary. */
export const BIG_ORDER_THRESHOLD = 50;

/**
 * Normalizes fractional order totals (e.g. 51.273636363, 44.4, 61.55) into clean whole-GEL integers:
 * - Clean integers (within floating-point noise) and <= 0 stay unchanged.
 * - Big orders (>= 50 GEL): round down; if that lands 1 GEL above a 5-GEL boundary
 *   (51 -> 50, 56 -> 55, 61 -> 60, 101 -> 100), sacrifice 1 GEL for clean COD delivery.
 * - Small orders (< 50 GEL): round up to the next whole GEL (to our advantage).
 */
export function normalizeOrderTotal(rawTotal: number): number {
  if (!Number.isFinite(rawTotal) || rawTotal <= 0) return 0;
  const rounded = Math.round(rawTotal);
  if (Math.abs(rawTotal - rounded) < 1e-6) return rounded;
  if (rawTotal >= BIG_ORDER_THRESHOLD) {
    const floored = Math.floor(rawTotal);
    return floored % 5 === 1 ? floored - 1 : floored;
  }
  return Math.ceil(rawTotal);
}

/**
 * Computes a normalized whole-GEL total and matching subtotal so
 * `subtotal + shippingFee - discountTotal === total` always holds cleanly.
 */
export function normalizeOrderAmounts(
  rawSubtotal: number,
  shippingFee: number,
  discountTotal = 0,
): { subtotal: number; shippingFee: number; discountTotal: number; total: number } {
  const cleanShipping = Math.max(0, Math.round(shippingFee * 100) / 100);
  const cleanDiscount = Math.max(0, Math.round(discountTotal * 100) / 100);
  const rawTotal = rawSubtotal + cleanShipping - cleanDiscount;
  const total = normalizeOrderTotal(rawTotal);
  const subtotal = Math.max(0, Math.round((total - cleanShipping + cleanDiscount) * 100) / 100);
  return { subtotal, shippingFee: cleanShipping, discountTotal: cleanDiscount, total };
}