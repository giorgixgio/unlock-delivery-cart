import { useState, useEffect, useRef, useCallback } from "react";
import { ShoppingCart, ChevronUp, CheckCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { usePulseCTA } from "@/hooks/usePulseCTA";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * StickyCartHUD — collapsible bottom bar.
 *
 * DEFAULT (collapsed ~48px): cart icon + progress fraction + short nudge
 * EXPANDED (~auto): full CTA button + progress detail
 *
 * Auto-expands briefly after add-to-cart, then collapses.
 * Tap to expand/collapse manually.
 */
const StickyCartHUD = () => {
  const { items, total, itemCount, isUnlocked, remaining, threshold } = useCart();
  const { openCart } = useCartOverlay();
  const { handleCheckoutIntent } = useCheckoutGate();
  const location = useLocation();
  const pulse = usePulseCTA(itemCount > 0);
  const { t } = useLanguage();

  const [expanded, setExpanded] = useState(false);
  const [justUnlocked, setJustUnlocked] = useState(false);
  const prevUnlocked = useRef(isUnlocked);
  const prevCount = useRef(itemCount);
  const collapseTimer = useRef<ReturnType<typeof setTimeout>>();

  // Auto-expand briefly on item count change
  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setExpanded(true);
      clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => setExpanded(false), 2000);
    }
    prevCount.current = itemCount;
    return () => clearTimeout(collapseTimer.current);
  }, [itemCount]);

  // Unlock celebration
  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setJustUnlocked(true);
      setExpanded(true);
      setTimeout(() => setJustUnlocked(false), 2500);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  const toggleExpand = useCallback(() => {
    setExpanded(e => !e);
    clearTimeout(collapseTimer.current);
  }, []);

  if (location.pathname === "/success" || location.pathname === "/cart" || location.pathname.startsWith("/admin")) return null;
  if (itemCount === 0) return null;

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-50 bg-card border-t shadow-lg transition-all duration-300",
      isUnlocked ? "border-success" : "border-border",
      justUnlocked && "animate-glow-pulse"
    )}>
      <div className="container max-w-2xl mx-auto px-4">
        {/* ── Collapsed bar (always visible) ── */}
        <button
          onClick={toggleExpand}
          className="w-full flex items-center gap-3 py-2.5"
        >
          {/* Cart icon with count */}
          <div className="relative flex-shrink-0">
            <ShoppingCart className={cn(
              "w-5 h-5",
              isUnlocked ? "text-success" : "text-foreground"
            )} />
            <span className={cn(
              "absolute -top-1.5 -right-2 text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5 leading-none",
              isUnlocked
                ? "bg-success text-success-foreground"
                : "bg-primary text-primary-foreground"
            )}>
              {itemCount}
            </span>
          </div>

          {/* Short message */}
          <div className="flex-1 text-left min-w-0">
            {isUnlocked ? (
              <span className="text-sm font-bold text-success truncate">
                🎉 შეკვეთა მზადაა
              </span>
            ) : (
              <span className="text-sm font-bold text-foreground truncate">
                +{remaining} პროდუქტი შეკვეთის გასახსნელად
              </span>
            )}
          </div>

          {/* Progress fraction */}
          <span className={cn(
            "text-xs font-extrabold px-2 py-0.5 rounded-full flex-shrink-0",
            isUnlocked
              ? "bg-success/15 text-success"
              : "bg-primary/10 text-primary"
          )}>
            {itemCount}/{threshold}
          </span>

          {/* Expand chevron */}
          <ChevronUp className={cn(
            "w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0",
            expanded && "rotate-180"
          )} />
        </button>

        {/* ── Expanded section ── */}
        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          expanded ? "max-h-[120px] opacity-100 pb-3" : "max-h-0 opacity-0 pb-0"
        )}>
          {/* Mini progress bar */}
          <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden mb-3">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500 ease-out",
                isUnlocked ? "delivery-path-complete" : "delivery-path-active"
              )}
              style={{ width: `${Math.min(100, (itemCount / threshold) * 100)}%` }}
            />
          </div>

          {/* Thumbnails row */}
          <div className="flex items-center gap-2 mb-2.5">
            <div className="flex gap-1 flex-shrink-0 overflow-x-auto">
              {items.slice(0, 4).map((item) => (
                <div key={item.product.id} className="relative w-8 h-8 rounded-md overflow-hidden border border-border flex-shrink-0">
                  <img src={item.product.image} alt={item.product.title} className="w-full h-full object-cover" />
                  {item.quantity > 1 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[8px] font-bold w-3 h-3 rounded-full flex items-center justify-center">{item.quantity}</span>
                  )}
                </div>
              ))}
              {items.length > 4 && (
                <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground border border-border">+{items.length - 4}</div>
              )}
            </div>
            <span className="text-sm font-extrabold text-foreground ml-auto">{total.toFixed(2)} ₾</span>
          </div>

          {/* CTA button */}
          <Button
            onClick={() => {
              if (isUnlocked) openCart();
              else handleCheckoutIntent("sticky_hud");
            }}
            className={cn(
              "w-full h-11 text-base font-bold rounded-xl transition-all duration-200",
              isUnlocked
                ? `bg-success hover:bg-success/90 text-success-foreground ${pulse ? "animate-cta-pulse-success" : ""}`
                : `bg-primary hover:bg-primary/90 text-primary-foreground ${pulse ? "animate-cta-pulse" : ""}`
            )}
            size="lg"
          >
            {isUnlocked
              ? t("complete_order_btn")
              : `დამატე კიდევ ${remaining} — გახსენი შეკვეთა`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StickyCartHUD;
