import { Droplets, Scissors, Wind } from "lucide-react";
import { ProductBenefitBadge, BenefitTone, getProductBenefitBadges } from "@/lib/productBenefitBadges";

const toneClasses: Record<BenefitTone, string> = {
  dark: "bg-foreground text-background",
  deal: "bg-deal text-deal-foreground",
  amber: "bg-secondary text-foreground",
};

const iconFor = ({ icon }: ProductBenefitBadge) => {
  const cls = "h-4 w-4 shrink-0";
  if (icon === "hair") return <Scissors className={cls} aria-hidden="true" />;
  if (icon === "smell") return <Wind className={cls} aria-hidden="true" />;
  return <Droplets className={cls} aria-hidden="true" />;
};

/**
 * High-contrast benefit pills for SKUs that have them. Rendered below the product
 * image (never on top of it) so supplier-baked text in photos stays readable.
 */
const ProductBenefitBadges = ({ sku }: { sku: string | number | undefined | null }) => {
  const badges = getProductBenefitBadges(sku);
  if (badges.length === 0) return null;

  return (
    <div className="flex flex-wrap justify-center gap-2" role="list">
      {badges.map((badge) => (
        <span
          key={badge.text}
          role="listitem"
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-extrabold leading-none shadow-sm ring-1 ring-foreground/10 ${toneClasses[badge.tone]}`}
        >
          {iconFor(badge)}
          {badge.text}
        </span>
      ))}
    </div>
  );
};

export default ProductBenefitBadges;
