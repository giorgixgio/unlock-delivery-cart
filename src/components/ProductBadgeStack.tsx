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
 * Renders 0-2 badges on a product card image overlay.
 * Position: top-left for primary, top-right for secondary.
 */
const ProductBadgeStack = memo(({ product, gridIndex = 0, overrides, context = "grid" }: Props) => {
  const proof = useMemo(
    () => generateProductProof(product, gridIndex, overrides, context),
    [product.id, gridIndex, context]
  );

  if (proof.badges.length === 0) return null;

  return (
    <>
      {proof.badges.map((badge, i) => (
        <span
          key={i}
          className={`absolute z-10 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm ${badgeColors[badge.color]} ${
            badge.position === "top-left" ? "top-2 left-2" : "top-2 right-2"
          }`}
        >
          {badge.text}
        </span>
      ))}
    </>
  );
});

ProductBadgeStack.displayName = "ProductBadgeStack";
export default ProductBadgeStack;
