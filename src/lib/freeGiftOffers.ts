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
  // ბატარეაზე მომუშავე ნათურა → 3-დონიანი დანების გასამწფო
  "450": {
    giftSku: "242",
    valueGel: 19,
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
  "411": {
    giftSku: "294",
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
  "123": {
    giftSku: "57",
    valueGel: 9,
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
  "24": {
    giftSku: "423",
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
  "4": {
    giftSku: "307",
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
  "454": {
    giftSku: "8",
    label: "საჩუქარი",
    headline: "საჩუქარი ყველა შეკვეთაზე",
    bullets: [
      "იგზავნება იმავე ამანათში — დამატებითი გადასახადის გარეშე",
      "უკვე დამატებულია შენს შეკვეთაში",
    ],
  },
};

/** Base SKU → gift SKU pairs. Orders holding exactly one such pair are still
 *  treated as a SINGLE-SKU order for courier picking (one bin trip, gift is
 *  grabbed alongside), while the printed label lists both SKUs. */
export const FREE_GIFT_PAIRS: [string, string][] = Object.entries(FREE_GIFT_OFFERS).map(
  ([base, o]) => [base, o.giftSku]
);

/** Non-gift SKU pairs that also stay in the SINGLE lane for courier picking
 *  (paid upsell that ships in the same parcel). Keep in sync with the
 *  GIFT_PAIRS list in supabase/functions/export-courier/index.ts. */
export const SINGLE_LANE_PAIRS: [string, string][] = [
  ...FREE_GIFT_PAIRS,
  // SKU 002 (camera) + its 0011 GPS-tracker upsell — picked together.
  ["002", "0011"],
];

/** True when the order's SKU set is exactly one single-lane pair
 *  (base+gift, or an allowed base+upsell combo). */
export function isGiftPairSkuSet(skus: string[]): boolean {
  const set = new Set(skus.map(String).filter(Boolean));
  if (set.size !== 2) return false;
  return SINGLE_LANE_PAIRS.some(([b, g]) => set.has(b) && set.has(g));
}

export function getFreeGiftOffer(sku?: string | null): FreeGiftOffer | null {
  if (!sku) return null;
  return FREE_GIFT_OFFERS[String(sku)] ?? null;
}
