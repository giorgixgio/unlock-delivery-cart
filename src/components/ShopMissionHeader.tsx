import { useMemo } from "react";
import { ShoppingCart, Lock, Unlock, Gift, Package, ChevronRight } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { cn } from "@/lib/utils";

/**
 * ShopMissionHeader — sticky gamified progress header for SKU-entry grid pages.
 * Drives users from hero-item entry toward multi-item bundle completion.
 *
 * States:
 *   A) 0 items  → orient + invite
 *   B) partial  → progress + encourage
 *   C) unlocked → celebrate + CTA
 */
const ShopMissionHeader = () => {
  const { itemCount, remaining, isUnlocked, threshold } = useCart();
  const { openCart } = useCartOverlay();

  const progress = useMemo(
    () => Math.min(100, (itemCount / threshold) * 100),
    [itemCount, threshold]
  );

  // Step dots
  const steps = useMemo(() => {
    return Array.from({ length: threshold }, (_, i) => i < itemCount);
  }, [threshold, itemCount]);

  return (
    <div className="sticky top-0 z-40">
      {/* ── Brand bar ── */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="container max-w-2xl mx-auto px-3 flex items-center gap-2 h-12">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex-shrink-0 font-extrabold tracking-tight text-lg text-primary"
          >
            BigMart
          </button>
          <div className="flex-1" />
          <button
            onClick={() => openCart()}
            className="p-1.5 rounded-full hover:bg-muted transition-colors relative"
            aria-label="კალათა"
          >
            <ShoppingCart className="w-5 h-5 text-foreground" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Mission bar ── */}
      <div
        className={cn(
          "border-b transition-colors duration-300",
          isUnlocked
            ? "bg-success/10 border-success/30"
            : "bg-card border-border"
        )}
      >
        <div className="container max-w-2xl mx-auto px-3 py-2.5">
          {/* Main message */}
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500",
                isUnlocked
                  ? "bg-success text-success-foreground scale-110"
                  : itemCount > 0
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {isUnlocked ? (
                <Unlock className="w-4 h-4" />
              ) : itemCount > 0 ? (
                <Gift className="w-4 h-4" />
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {isUnlocked ? (
                <button onClick={() => openCart()} className="text-left w-full group">
                  <p className="text-sm font-bold text-success leading-tight">
                    🎉 შეკვეთა გახსნილია!
                  </p>
                  <p className="text-[11px] text-success/80 leading-tight flex items-center gap-0.5">
                    გააგრძელე შეკვეთა
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </p>
                </button>
              ) : itemCount === 0 ? (
                <div>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    🎁 აირჩიე {threshold} პროდუქტი — უფასო მიწოდება
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    დაამატე პროდუქტები შეკვეთის გასახსნელად
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-bold text-foreground leading-tight">
                    კიდევ {remaining} პროდუქტი და შეკვეთა იხსნება
                  </p>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    კალათაში: {itemCount} / {threshold} პროდუქტი
                  </p>
                </div>
              )}
            </div>

            {/* Compact cart count on right */}
            {itemCount > 0 && !isUnlocked && (
              <span className="text-xs font-extrabold text-primary bg-primary/10 px-2 py-1 rounded-full flex-shrink-0">
                {itemCount}/{threshold}
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="mt-2 flex items-center gap-1.5">
            {/* Step dots for small thresholds (≤6), otherwise continuous bar */}
            {threshold <= 6 ? (
              <div className="flex items-center gap-1.5 flex-1">
                {steps.map((filled, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-2 flex-1 rounded-full transition-all duration-500",
                      filled
                        ? isUnlocked
                          ? "bg-success"
                          : "bg-primary"
                        : "bg-muted"
                    )}
                  />
                ))}
              </div>
            ) : (
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isUnlocked ? "bg-success" : "bg-primary"
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            {/* End icon */}
            <Package
              className={cn(
                "w-4 h-4 flex-shrink-0 transition-colors duration-300",
                isUnlocked ? "text-success" : "text-muted-foreground"
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopMissionHeader;
