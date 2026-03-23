import { useState, useEffect, useRef, useCallback } from "react";
import { ShoppingCart, ChevronUp } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { usePulseCTA } from "@/hooks/usePulseCTA";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setExpanded(true);
      clearTimeout(collapseTimer.current);
      collapseTimer.current = setTimeout(() => setExpanded(false), 2000);
    }
    prevCount.current = itemCount;
    return () => clearTimeout(collapseTimer.current);
  }, [itemCount]);

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

  // Tappable collapsed bar — whole bar navigates when unlocked
  const handleCollapsedTap = () => {
    if (isUnlocked) {
      openCart();
    } else {
      toggleExpand();
    }
  };

  // ── Completion mode: full-width CTA only ──
  if (isUnlocked) {
    return (
      <div className={cn(
        "fixed bottom-0 left-0 right-0 z-50 transition-all duration-500",
        justUnlocked && "animate-fade-in"
      )}>
        <div className="container max-w-2xl mx-auto px-4 pb-[env(safe-area-inset-bottom)]">
          <p className="text-center text-[11px] font-semibold text-success mb-1.5 pt-2">
            ✅ შეკვეთა მზადაა
          </p>
          <Button
            onClick={() => openCart()}
            className="w-full h-12 text-base font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg mb-2"
            size="lg"
          >
            კალათაზე გადასვლა
          </Button>
        </div>
      </div>
    );
  }

  // ── Progress mode ──
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-lg transition-all duration-300">
      <div className="container max-w-2xl mx-auto px-4">
        {/* ── Collapsed bar ── */}
        <button onClick={toggleExpand} className="w-full flex items-center gap-3 py-2.5">
          <div className="relative flex-shrink-0">
            <ShoppingCart className="w-5 h-5 text-foreground" />
            <span className="absolute -top-1.5 -right-2 text-[9px] font-bold min-w-[16px] h-[16px] rounded-full flex items-center justify-center px-0.5 leading-none bg-primary text-primary-foreground">
              {itemCount}
            </span>
          </div>

          <span className="text-sm font-bold text-foreground truncate block flex-1 text-left">
            +{remaining}
          </span>

          <span className="text-xs font-extrabold px-2 py-0.5 rounded-full flex-shrink-0 bg-primary/10 text-primary">
            {itemCount}/{threshold}
          </span>

          <ChevronUp className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200 flex-shrink-0", expanded && "rotate-180")} />
        </button>

        {/* ── Expanded section ── */}
        <div className={cn(
          "overflow-hidden transition-all duration-300 ease-out",
          expanded ? "max-h-[120px] opacity-100 pb-3" : "max-h-0 opacity-0 pb-0"
        )}>
          <div className="h-1.5 bg-muted/60 rounded-full overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-[width] duration-500 ease-out delivery-path-active"
              style={{ width: `${Math.min(100, (itemCount / threshold) * 100)}%` }}
            />
          </div>

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

          <Button
            onClick={() => handleCheckoutIntent("sticky_hud")}
            className={cn(
              "w-full h-11 text-base font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-200",
              pulse && "animate-cta-pulse"
            )}
            size="lg"
          >
            დამატე კიდევ {remaining} — გახსენი შეკვეთა
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StickyCartHUD;
