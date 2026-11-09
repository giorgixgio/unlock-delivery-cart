import type { BumpConfig } from '@/hooks/useLandingConfig';

/** Single source of truth for a bump's added line total — used by the modal (persisted line) and the funnel subtotal. */
export function bumpLineTotal(unitPrice: number, bump: BumpConfig): number {
  return bump.fixed_price ?? unitPrice * (1 - bump.discount_pct / 100) * bump.bump_qty;
}
