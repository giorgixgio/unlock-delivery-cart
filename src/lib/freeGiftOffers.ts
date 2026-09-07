/**
 * Pre-selected free gift attached to every order of a given base SKU
 * (landing funnel only). The gift is added to the order as a real
 * order item priced at 0 ₾ — so warehouse pickers and courier labels
 * see BOTH SKUs and nothing gets forgotten.
 */
export interface FreeGiftOffer {
  /** SKU of the product given away for free */
  giftSku: string;
  /** Value shown as struck-through (GEL). Falls back to the product price. */
  valueGel?: number;
  /** Short marketing name shown on the landing page */
  label: string;
  headline: string;
  bullets: string[];
}

export const FREE_GIFT_OFFERS: Record<string, FreeGiftOffer> = {
  // შინაური ცხოველების თმის კოლექტორი → ჩანთა გასარეცხი ტანსაცმლისთვის
  "316": {
    giftSku: "147",
    valueGel: 24,
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
};

export function getFreeGiftOffer(sku?: string | null): FreeGiftOffer | null {
  if (!sku) return null;
  return FREE_GIFT_OFFERS[String(sku)] ?? null;
}
