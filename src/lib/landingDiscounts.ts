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
const SKU_DISCOUNT_OVERRIDES: Record<string, Record<number, number>> = {};

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

/** Highest quantity tier defined for a SKU (usually 3). */
export function getMaxTierQty(sku?: string): number {
  const map = (sku && SKU_DISCOUNT_OVERRIDES[String(sku)]) || DISCOUNT_MAP;
  return Math.max(...Object.keys(map).map(Number));
}

/**
 * Line total for ANY quantity, matching the storefront tiers.
 * Up to the max tier (3) it uses the tier price exactly.
 * Above it, every extra unit is priced at the best (cheapest) per-unit tier price,
 * so operators adding units never create a price the customer wouldn't have seen.
 */
export function getTieredLineTotal(basePrice: number, qty: number, sku?: string): number {
  if (qty <= 0) return 0;
  const maxTier = getMaxTierQty(sku);
  if (qty <= maxTier) return getDiscountedTotal(basePrice, qty, sku);
  const bestUnit = getDiscountedTotal(basePrice, maxTier, sku) / maxTier;
  const raw = getDiscountedTotal(basePrice, maxTier, sku) + bestUnit * (qty - maxTier);
  return Math.round(raw * 100) / 100;
}

/** Effective per-unit price for a quantity, following the tiers. */
export function getTieredUnitPrice(basePrice: number, qty: number, sku?: string): number {
  if (qty <= 0) return basePrice;
  return Math.round((getTieredLineTotal(basePrice, qty, sku) / qty) * 100) / 100;
}
