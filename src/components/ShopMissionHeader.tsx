import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { ShoppingCart, Gift, Lock } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { cn } from "@/lib/utils";

/**
 * ShopMissionHeader — compact, gamified, scroll-aware sticky header.
 *
 * States:
 *   A) 0 items  → orient + invite
 *   B) partial  → progress + encourage
 *   C) unlocked → celebrate + CTA
 *
 * Features:
 *   - Scroll-shrink (not hide) on scroll down
 *   - Smooth progress bar with flow animation
 *   - Icon scale transitions on progress updates
 *   - Max ~60px height
 */
const ShopMissionHeader = () => {
  const { itemCount, remaining, isUnlocked, threshold } = useCart();
  const { openCart } = useCartOverlay();

  const progress = useMemo(
    () => Math.min(100, (itemCount / threshold) * 100),
    [itemCount, threshold]
  );

  // Scroll-shrink logic
  const [shrunk, setShrunk] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (y > 80 && y > lastScrollY.current + 8) setShrunk(true);
      else if (y < lastScrollY.current - 8 || y < 40) setShrunk(false);
      lastScrollY.current = y;
      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // Icon pulse on item count change
  const [iconPulse, setIconPulse] = useState(false);
  const prevCount = useRef(itemCount);
  useEffect(() => {
    if (itemCount !== prevCount.current && itemCount > 0) {
      setIconPulse(true);
      const t = setTimeout(() => setIconPulse(false), 500);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  const StatusIcon = itemCount > 0 ? Gift : Lock;

  return (
    <div className="sticky top-0 z-40">
      {/* ── Brand bar ── */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="container max-w-2xl mx-auto px-3 flex items-center gap-2 h-11">
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

      {/* ── Mission bar — hidden in completion mode ── */}
      <div
        className={cn(
          "border-b transition-all duration-500 overflow-hidden",
          isUnlocked
            ? "max-h-0 border-transparent"
            : "bg-card border-border",
          !isUnlocked && (shrunk ? "max-h-[38px]" : "max-h-[72px]")
        )}
      >
        <div className={cn(
          "container max-w-2xl mx-auto px-3 transition-all duration-300",
          shrunk ? "py-1.5" : "py-2"
        )}>
          {/* Main row: icon + message + fraction */}
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-400",
                shrunk ? "w-6 h-6" : "w-7 h-7",
                itemCount > 0
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground",
                iconPulse && "scale-125"
              )}
            >
              <StatusIcon className={cn(shrunk ? "w-3 h-3" : "w-3.5 h-3.5")} />
            </div>

            <div className="flex-1 min-w-0">
              {itemCount === 0 ? (
                <div>
                  <p className="text-[13px] font-bold text-foreground leading-tight truncate">
                    🎁 აირჩიე {threshold} პროდუქტი — გახსენი შეკვეთა
                  </p>
                  {!shrunk && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      დაამატე პროდუქტები შეკვეთის გასახსნელად
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className={cn(
                    "text-[13px] font-bold leading-tight truncate",
                    remaining <= 1 ? "text-success" : "text-foreground"
                  )}>
                    {remaining <= 1
                      ? "🔥 თითქმის მოხერხდა — კიდევ 1 პროდუქტი!"
                      : `კიდევ ${remaining} პროდუქტი — გახსნი შეკვეთას`}
                  </p>
                  {!shrunk && (
                    <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                      კალათაში: {itemCount} / {threshold} პროდუქტი
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Compact fraction badge */}
            {itemCount > 0 && (
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full flex-shrink-0 text-primary bg-primary/10">
                {itemCount}/{threshold}
              </span>
            )}
          </div>

          {/* Thin animated progress bar */}
          <div className={cn(
            "mt-1.5 h-1.5 bg-muted/60 rounded-full overflow-hidden transition-all duration-300",
            shrunk && "mt-1 h-1"
          )}>
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out delivery-path-active"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ShopMissionHeader;
