import { useState, useEffect, useRef, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { Check, Truck, CreditCard } from "lucide-react";

const CheckoutPriceReveal = () => {
  const { items, total, orderTotal } = useCart();

  const { oldTotal, hasSale, savings } = useMemo(() => {
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
    return { oldTotal: hasAny ? old : null, hasSale: hasAny && sav > 0, savings: sav };
  }, [items, total]);

  // Slot-machine animation
  const [phase, setPhase] = useState<"counting" | "done">("counting");
  const [displayValue, setDisplayValue] = useState(0);
  const hasRun = useRef(false);
  const prefersReduced = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Start value for countdown: use oldTotal if available, otherwise 2x total
  const startValue = oldTotal ?? orderTotal * 2.2;

  useEffect(() => {
    if (hasRun.current || prefersReduced.current) {
      setDisplayValue(orderTotal);
      setPhase("done");
      return;
    }
    hasRun.current = true;

    setDisplayValue(startValue);
    const duration = 1000; // ms
    const startTime = performance.now();
    let raf: number;

    const animate = (time: number) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic for fast start, smooth end
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue - (startValue - orderTotal) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      } else {
        setDisplayValue(orderTotal);
        setPhase("done");
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [orderTotal, startValue]);

  const showBounce = phase === "done";

  return (
    <div className="checkout-card px-4 py-3 space-y-2">
      {/* Price display */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-foreground">სულ გადასახდელი</span>
        <div className="flex items-baseline gap-2">
          {hasSale && oldTotal && phase === "done" && (
            <span className="text-sm text-muted-foreground line-through animate-fade-in">
              {oldTotal.toFixed(1)}₾
            </span>
          )}
          <span
            className={`text-2xl font-extrabold text-primary transition-transform duration-300 ${
              showBounce ? "animate-checkout-bounce" : ""
            }`}
          >
            {displayValue.toFixed(1)}₾
          </span>
        </div>
      </div>

      {/* Savings badge */}
      {hasSale && phase === "done" && (
        <div className="flex justify-end animate-fade-in">
          <span className="text-xs font-bold bg-deal text-deal-foreground px-2.5 py-1 rounded-md inline-flex items-center gap-1">
            შენ დაზოგე {savings.toFixed(1)}₾ 🎉
          </span>
        </div>
      )}

      {/* Micro reinforcement */}
      {phase === "done" && (
        <div className="flex items-center gap-3 pt-1 animate-fade-in">
          <div className="flex items-center gap-1 text-[10px] font-semibold text-success">
            <Truck className="w-3 h-3" />
            <span>უფასო მიწოდება</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
            <CreditCard className="w-3 h-3" />
            <span>გადახდა კურიერთან</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CheckoutPriceReveal;
