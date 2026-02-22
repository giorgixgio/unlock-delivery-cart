import { useMemo, useState, useEffect, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { DELIVERY_THRESHOLD } from "@/lib/constants";
import AnimatedNumber from "@/components/AnimatedNumber";

interface CartTotalBreakdownProps {
  animateOnMount?: boolean;
}

const CartTotalBreakdown = ({ animateOnMount = false }: CartTotalBreakdownProps) => {
  const { items, total, isUnlocked } = useCart();
  const { t } = useLanguage();

  const { oldSubtotal, hasDiscount, savings, savingsPercent } = useMemo(() => {
    let old = 0;
    let hasAny = false;
    for (const { product, quantity } of items) {
      if (product.compareAtPrice && product.compareAtPrice > product.price) {
        old += product.compareAtPrice * quantity;
        hasAny = true;
      } else {
        old += product.price * quantity;
      }
    }
    const sav = hasAny ? old - total : 0;
    const pct = hasAny && old > 0 ? Math.round((sav / old) * 100) : 0;
    return { oldSubtotal: hasAny ? old : null, hasDiscount: hasAny && sav > 0, savings: sav, savingsPercent: pct };
  }, [items, total]);

  const shippingCost = isUnlocked ? 0 : 5;

  const [phase, setPhase] = useState<"idle" | "counting" | "strike" | "reveal" | "done">(
    animateOnMount ? "idle" : "done"
  );
  const hasAnimated = useRef(false);
  const prefersReduced = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    if (!animateOnMount || hasAnimated.current || prefersReduced.current) {
      setPhase("done");
      return;
    }
    hasAnimated.current = true;
    setPhase("counting");
    const t1 = setTimeout(() => setPhase("strike"), 900);
    const t2 = setTimeout(() => setPhase("reveal"), 1300);
    const t3 = setTimeout(() => setPhase("done"), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [animateOnMount]);

  const showStrike = phase === "strike" || phase === "reveal" || phase === "done";
  const showFinal = phase === "reveal" || phase === "done";
  const showBadge = phase === "done";

  return (
    <div className="space-y-2">
      {phase === "counting" && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t("total")}</span>
          <span className="text-xl font-extrabold text-foreground animate-scale-in">
            <AnimatedNumber value={total} duration={800} /> ₾
          </span>
        </div>
      )}

      {phase !== "counting" && (
        <>
          {hasDiscount && oldSubtotal && (
            <div className={`flex items-center justify-between ${showStrike ? "animate-fade-in" : "opacity-0"}`}>
              <span className="text-sm text-muted-foreground">{t("subtotal")}</span>
              <span className="text-sm text-muted-foreground line-through">
                {oldSubtotal.toFixed(1)} ₾
              </span>
            </div>
          )}

          {hasDiscount && showStrike && (
            <div className="flex items-center justify-between animate-fade-in">
              <span className="text-sm text-deal font-semibold">{t("discount")}</span>
              <span className="text-sm text-deal font-bold">−{savings.toFixed(1)} ₾</span>
            </div>
          )}

          {showFinal && (
            <div className="flex items-center justify-between animate-fade-in">
              <span className="text-sm text-muted-foreground">{t("delivery_fee")}</span>
              {isUnlocked ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-muted-foreground line-through">5 ₾</span>
                  <span className="text-sm font-bold text-success">{t("free")}</span>
                </div>
              ) : (
                <span className="text-sm font-semibold text-foreground">{shippingCost} ₾</span>
              )}
            </div>
          )}

          {showFinal && <div className="border-t border-border" />}

          {showFinal && (
            <div className={`flex items-center justify-between ${phase === "reveal" ? "animate-sale-highlight" : ""}`}>
              <span className="text-base font-bold text-foreground">{t("to_pay")}</span>
              <span className="text-2xl font-extrabold text-primary">
                {total.toFixed(1)} ₾
              </span>
            </div>
          )}

          {hasDiscount && showBadge && (
            <div className="flex justify-end animate-fade-in">
              <span className="text-xs font-bold bg-deal text-deal-foreground px-2.5 py-1 rounded-md">
                {t("you_save")} {savingsPercent}% (₾{savings.toFixed(1)})
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default CartTotalBreakdown;
