/**
 * Per-SKU animated demo media (short loop clips / GIFs / animated WebP) shown on
 * product landing pages. Add an entry here to surface a "see it in action" card
 * on that product's landing page. Keep entries sparse and high-quality — these
 * are conversion assets, not gallery images.
 */

export interface ProductDemoMedia {
  /** Animated demo image URL (animated WebP / GIF). */
  src: string;
  /** Short Georgian caption shown under the clip. */
  caption: string;
  /** Optional small eyebrow label above the caption. */
  eyebrow?: string;
}

import sku0019Demo from "@/assets/sku0019-demo.webp.asset.json";

const NOZZLE_DEMO: ProductDemoMedia = {
  src: sku0019Demo.url,
  eyebrow: "როგორ მუშაობს",
  caption: "მაღალი წნევის ჭავლი — ერთი გადასმით ჩამორეცხავს ჭუჭყს ბეტონიდან და ეზოდან",
};

const DEMO_MEDIA: Record<string, ProductDemoMedia> = {
  // Pet-hair laundry collector — demo of placing it in the washing machine
  "316": {
    src: "/images/sku316-demo.webp",
    eyebrow: "როგორ მუშაობს",
    caption: "უბრალოდ ჩაუდეთ სარეცხ მანქანაში — თმა და ბუსუსი თავად შემოიყრება",
  },
  // High-pressure washing nozzle (TrendMart)
  "g888-t4656-0019": NOZZLE_DEMO,
};

export function getProductDemoMedia(sku: string | number | undefined | null): ProductDemoMedia | null {
  if (!sku) return null;
  return DEMO_MEDIA[String(sku).trim().toLowerCase()] ?? null;
}
