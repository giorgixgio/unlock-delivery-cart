/**
 * Display-only price masking for the /5for39 bundle landing page.
 *
 * The bundle page sells everything at one flat bundle price, so per-product
 * prices are shown purely as a strike-through anchor. This keeps that anchor
 * inside a tight, uniform 15–20₾ range so the grid scans cleanly.
 *
 * IMPORTANT: this is presentational only. Database prices, API payloads and
 * cart/checkout totals are never derived from these numbers.
 */

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

/** Stable per-product anchor price between 15₾ and 20₾. */
export const getBundleDisplayPrice = (id: string): number => 15 + (hash(String(id)) % 6);
