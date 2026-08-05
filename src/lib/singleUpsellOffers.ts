/**
 * Per-product single-item post-phone upsell offers (landing funnel only).
 * Keyed by the BASE product SKU shown on the landing page.
 * When a base SKU has an entry here, the generic multi-product upsell sheet
 * is skipped for that product and this one-product offer is shown instead.
 */
export interface SingleUpsellOffer {
  /** SKU of the product being offered */
  offerSku: string;
  /** Price the customer pays for the offer (GEL) */
  offerPrice: number;
  /** Price shown as struck-through (GEL) */
  compareAtPrice: number;
  /** Countdown length in seconds */
  timerSeconds: number;
  headline: string;
  subline: string;
  bullets: string[];
}

export const SINGLE_UPSELL_OFFERS: Record<string, SingleUpsellOffer> = {
  // ფეხსაცმლის ჯადოსნური საშლელი → სფერული დეოდორანტები ფეხსაცმლისთვის 6ც
  "134": {
    offerSku: "112",
    offerPrice: 5,
    compareAtPrice: 9,
    timerSeconds: 180,
    headline: "დაამატე ერთჯერადი შეთავაზება — მხოლოდ 5₾",
    subline: "ეს ფასი მოქმედებს მხოლოდ ახლა, ამ შეკვეთაში",
    bullets: [
      "სუნის მოცილება ფეხსაცმელში 6 თვემდე",
      "იგივე მიტანა — დამატებითი გადასახადის გარეშე",
      "იხდი კურიერთან მიღებისას",
    ],
  },
};

export function getSingleUpsellOffer(sku?: string | null): SingleUpsellOffer | null {
  if (!sku) return null;
  return SINGLE_UPSELL_OFFERS[String(sku)] ?? null;
}
