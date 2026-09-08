/**
 * Per-SKU animated demo media (short loop clips / GIFs / animated WebP) shown on
 * product landing pages. Add an entry here to surface a "see it in action" card
 * on that product's landing page. Keep entries sparse and high-quality — these
 * are conversion assets, not gallery images.
 */
import sku316DemoAsset from "@/assets/sku316-demo.webp.asset.json";

export interface ProductDemoMedia {
  /** Animated demo image URL (animated WebP / GIF). */
  src: string;
  /** Short Georgian caption shown under the clip. */
  caption: string;
  /** Optional small eyebrow label above the caption. */
  eyebrow?: string;
}

const DEMO_MEDIA: Record<string, ProductDemoMedia> = {
  // Pet-hair laundry collector — demo of placing it in the washing machine
  "316": {
    src: sku316DemoAsset.url,
    eyebrow: "როგორ მუშაობს",
    caption: "უბრალოდ ჩაუდეთ სარეცხ მანქანაში — თმა და ბუსუსი თავად შემოი收集ა",
  },
};

export function getProductDemoMedia(sku: string | number | undefined | null): ProductDemoMedia | null {
  if (!sku) return null;
  return DEMO_MEDIA[String(sku)] ?? null;
}
