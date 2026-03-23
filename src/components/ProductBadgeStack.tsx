import { memo, useMemo } from "react";
import { Product } from "@/lib/constants";
import { generateProductProof, ProofBadge, AdminOverrides } from "@/lib/socialProofEngine";

interface Props {
  product: Product;
  gridIndex?: number;
  overrides?: AdminOverrides;
  context?: "grid" | "hero" | "landing";
}

const badgeColors: Record<ProofBadge["color"], string> = {
  red: "bg-destructive text-destructive-foreground",
  orange: "bg-secondary text-secondary-foreground",
  green: "bg-success text-success-foreground",
  dark: "bg-foreground text-background",
  yellow: "bg-[hsl(45,90%,48%)] text-foreground",
};

/**
 * Renders max 2 badges on a product card image overlay.
 * HORIZONTAL row at top-left with gap.
 * Single badge gets generous max-width; two badges share space.
 * Discount badge stays top-right and never collides.
 */
const ProductBadgeStack = memo(({ product, gridIndex = 0, overrides, context = "grid" }: Props) => {
  const proof = useMemo(
    () => generateProductProof(product, gridIndex, overrides, context),
    [product.id, gridIndex, context]
  );

  if (proof.badges.length === 0) return null;

  const leftBadges = proof.badges.filter(b => b.position === "top-left").slice(0, 2);
  const rightBadges = proof.badges.filter(b => b.position === "top-right").slice(0, 1);

  // Determine max-width per badge based on count
  const badgeMaxWidth = leftBadges.length === 1
    ? "max-w-[calc(100%-4px)]"   // single badge: nearly full container width
    : "max-w-[calc(50%-4px)]";   // two badges: half each minus gap

  return (
    <>
      {leftBadges.length > 0 && (
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-row gap-1 max-w-[calc(100%-3.5rem)]">
          {leftBadges.map((badge, i) => (
            <span
              key={i}
              className={`text-[9px] leading-none font-bold px-1.5 py-[3px] rounded-full shadow-sm whitespace-nowrap overflow-hidden text-ellipsis ${badgeMaxWidth} block ${badgeColors[badge.color]}`}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
      {rightBadges.map((badge, i) => (
        <span
          key={`r-${i}`}
          className={`absolute top-1.5 right-1.5 z-10 text-[9px] leading-none font-bold px-1.5 py-[3px] rounded-full shadow-sm whitespace-nowrap ${badgeColors[badge.color]}`}
        >
          {badge.text}
        </span>
      ))}
    </>
  );
});

ProductBadgeStack.displayName = "ProductBadgeStack";
export default ProductBadgeStack;
