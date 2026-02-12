import { useState, useEffect, useRef } from "react";
import { CheckCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { usePulseCTA } from "@/hooks/usePulseCTA";

import DeliveryMissionBar from "./DeliveryMissionBar";
import DeliveryInfoMini from "./DeliveryInfoMini";
import SaleTotalDisplay from "./SaleTotalDisplay";
import { Button } from "@/components/ui/button";

const StickyCartHUD = () => {
  const { items, total, itemCount, isUnlocked, remaining } = useCart();
  const { openCart } = useCartOverlay();
  const { handleCheckoutIntent } = useCheckoutGate();
  const location = useLocation();
  const pulse = usePulseCTA(itemCount > 0);

  const [justUnlocked, setJustUnlocked] = useState(false);
  const prevUnlocked = useRef(isUnlocked);

  useEffect(() => {
    if (isUnlocked && !prevUnlocked.current) {
      setJustUnlocked(true);
      setTimeout(() => setJustUnlocked(false), 2500);
    }
    prevUnlocked.current = isUnlocked;
  }, [isUnlocked]);

  if (location.pathname === "/success" || location.pathname === "/cart" || location.pathname.startsWith("/admin")) return null;
  if (itemCount === 0) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 bg-card border-t-2 shadow-lg transition-all duration-300 ${
        isUnlocked ? "border-success glow-unlock" : "border-primary"
      } ${justUnlocked ? "animate-glow-pulse" : ""}`}
    >
      <div className="container max-w-2xl mx-auto px-4 py-2.5 space-y-1.5">
        {/* Row: thumbnails + total */}
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5 flex-shrink-0 overflow-x-auto">
            {items.slice(0, 5).map((item) => (
              <div
                key={item.product.id}
                className="relative w-9 h-9 rounded-md overflow-hidden border border-border flex-shrink-0 animate-scale-in"
              >
                <img
                  src={item.product.image}
                  alt={item.product.title}
                  className="w-full h-full object-cover"
                />
                {item.quantity > 1 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {item.quantity}
                  </span>
                )}
              </div>
            ))}
            {items.length > 5 && (
              <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground border border-border">
                +{items.length - 5}
              </div>
            )}
          </div>
          <div className="ml-auto">
            <SaleTotalDisplay size="sm" />
          </div>
        </div>

        {/* Mini mission bar */}
        <DeliveryMissionBar mini />

        {/* Success message or delivery info */}
        {isUnlocked ? (
          <div className="flex items-center justify-center gap-1.5 py-0.5 animate-success-reveal">
            <CheckCircle className="w-3.5 h-3.5 text-success" />
            <span className="text-xs font-bold text-success">🎉 უფასო მიტანა გახსნილია</span>
          </div>
        ) : (
          <DeliveryInfoMini />
        )}

        {/* CTA */}
        <Button
          onClick={() => {
            if (isUnlocked) {
              openCart();
            } else {
              handleCheckoutIntent("sticky_hud");
            }
          }}
          className={`w-full h-11 text-base font-bold rounded-xl transition-all duration-200 ${
            isUnlocked
              ? `bg-success hover:bg-success/90 text-success-foreground ${pulse ? "animate-cta-pulse-success" : ""}`
              : `bg-primary hover:bg-primary/90 text-primary-foreground ${pulse ? "animate-cta-pulse" : ""}`
          }`}
          size="lg"
        >
          {isUnlocked
            ? "შეკვეთის დასრულება"
            : `🔓 დაამატე ${remaining.toFixed(1)} ₾ — გახსენი შეკვეთა`}
        </Button>
        {!isUnlocked && (
          <p className="text-[10px] text-center text-muted-foreground font-medium">
            მინ. შეკვეთა {40} ₾
          </p>
        )}
      </div>
    </div>
  );
};

export default StickyCartHUD;
