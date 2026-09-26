import { TrendingDown } from "lucide-react";

interface LandingDealStripProps {
  /** Discount percentage shown as the deal pill. 0/undefined hides the pill. */
  discount?: number | null;
  /** Small promo badges (e.g. "⚡ ფლეშ ფასი"). Rendered as chips on the right. */
  badges?: string[];
}

/**
 * Full-width deal strip rendered directly BELOW the product image on /p landings.
 * Moves the discount + promo badges out of the image container so they can never
 * cover text that suppliers bake into their product photos.
 */
const LandingDealStrip = ({ discount, badges }: LandingDealStripProps) => {
  const hasDiscount = !!discount && discount > 0;
  const hasBadges = !!badges && badges.length > 0;
  if (!hasDiscount && !hasBadges) return null;

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-deal text-deal-foreground px-3 py-2 shadow-md">
      {hasDiscount ? (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex items-center gap-0.5 shrink-0 rounded-md bg-background px-2 py-1 text-base font-black leading-none text-deal">
            <TrendingDown className="h-3.5 w-3.5" strokeWidth={3} />
            {discount}%
          </span>
          <span className="truncate text-sm font-black tracking-tight">ფასდაკლება</span>
        </div>
      ) : (
        <span className="text-sm font-black tracking-tight">შეთავაზება</span>
      )}

      {hasBadges && (
        <div className="flex shrink-0 items-center gap-1.5 overflow-hidden">
          {badges.map((b) => (
            <span
              key={b}
              className="whitespace-nowrap rounded-full border border-deal-foreground/25 bg-deal-foreground/10 px-2 py-0.5 text-[10px] font-bold leading-tight"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default LandingDealStrip;
