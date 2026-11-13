// Per-SKU benefit badges shown on /p landings, directly below the product image.
// Presentation-only: they never change price, stock, or order eligibility.

export type BenefitTone = "dark" | "deal" | "amber";
export type BenefitIcon = "hair" | "smell" | "grease";

export interface ProductBenefitBadge {
  text: string;
  icon: BenefitIcon;
  tone: BenefitTone;
}

const PRODUCT_BENEFIT_BADGES: Record<string, ProductBenefitBadge[]> = {
  // Drain & trap opening powder — three claims taken straight from the product description.
  testpowder: [
    { text: "შლის თმას", icon: "hair", tone: "dark" },
    { text: "აშორებს სუნს", icon: "smell", tone: "deal" },
    { text: "აშორებს ცხიმს", icon: "grease", tone: "amber" },
  ],
};

export function getProductBenefitBadges(
  sku: string | number | undefined | null
): ProductBenefitBadge[] {
  if (sku === undefined || sku === null) return [];
  return PRODUCT_BENEFIT_BADGES[String(sku).trim()] ?? [];
}
