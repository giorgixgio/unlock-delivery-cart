import sku002PromoAsset from "@/assets/sku-002-security-promo-v2.jpg.asset.json";

export interface ProductLandingMedia {
  promoImage?: {
    src: string;
    alt: string;
  };
  preserveAuthoredDescription?: boolean;
}

const PRODUCT_LANDING_MEDIA: Record<string, ProductLandingMedia> = {
  "002": {
    promoImage: {
      src: sku002PromoAsset.url,
      alt: "მინი კამერა ტელეფონთან დაკავშირებული პირდაპირი მონიტორინგით",
    },
    preserveAuthoredDescription: true,
  },
};

export function getProductLandingMedia(
  sku: string | number | undefined | null
): ProductLandingMedia | null {
  if (sku === undefined || sku === null) return null;
  return PRODUCT_LANDING_MEDIA[String(sku)] ?? null;
}