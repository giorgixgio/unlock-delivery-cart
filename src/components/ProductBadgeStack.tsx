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
 * Top-left stacked vertically with gap, max-width enforced, text truncated.
 * Discount badge stays top-right and never collides.
 */
const ProductBadgeStack = memo(({ product, gridIndex = 0, overrides, context = "grid" }: Props) => {
  const proof = useMemo(
    () => generateProductProof(product, gridIndex, overrides, context),
    [product.id, gridIndex, context]
  );

  if (proof.badges.length === 0) return null;

  // Separate top-right (discount) from top-left (info) badges
  const leftBadges = proof.badges.filter(b => b.position === "top-left").slice(0, 2);
  const rightBadges = proof.badges.filter(b => b.position === "top-right").slice(0, 1);

  return (
    <>
      {/* Top-left: stacked vertically, max 2 */}
      {leftBadges.length > 0 && (
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 max-w-[calc(100%-3.5rem)]">
          {leftBadges.map((badge, i) => (
            <span
              key={i}
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm truncate max-w-full block ${badgeColors[badge.color]}`}
            >
              {badge.text}
            </span>
          ))}
        </div>
      )}
      {/* Top-right: discount badge, always separate */}
      {rightBadges.map((badge, i) => (
        <span
          key={`r-${i}`}
          className={`absolute top-2 right-2 z-10 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm whitespace-nowrap ${badgeColors[badge.color]}`}
        >
          {badge.text}
        </span>
      ))}
    </>
  );
});

ProductBadgeStack.displayName = "ProductBadgeStack";
export default ProductBadgeStack;
