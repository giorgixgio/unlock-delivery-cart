import { useState, useEffect, useRef, useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { Truck, CreditCard } from "lucide-react";

// Seeded random for synthetic compare price
function seededRand(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return (Math.abs(h) % 1000) / 1000;
}

const CheckoutPriceReveal = () => {
  const { items, total, orderTotal } = useCart();

  const { oldTotal, savings } = useMemo(() => {
    let old = 0;
    for (const { product, quantity } of items) {
      if (product.compareAtPrice && product.compareAtPrice > product.price) {
        old += product.compareAtPrice * quantity;
      } else {
        // Synthetic compare price
        const mult = 2.0 + seededRand(product.id + "_compare") * 0.9;
        old += Math.round(product.price * mult * 10) / 10 * quantity;
      }
    }
    const sav = old - total;
    return { oldTotal: old, savings: sav > 0 ? sav : 0 };
  }, [items, total]);

  // Slot-machine animation with delay
  const [phase, setPhase] = useState<"waiting" | "counting" | "done">("waiting");
  const [displayValue, setDisplayValue] = useState(0);
  const hasRun = useRef(false);
  const prefersReduced = useRef(
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const startValue = oldTotal;

  useEffect(() => {
    if (hasRun.current || prefersReduced.current) {
      setDisplayValue(orderTotal);
      setPhase("done");
      return;
    }
    hasRun.current = true;
    setDisplayValue(startValue);

    // 300ms delay before animation starts
    const delayTimer = setTimeout(() => {
      setPhase("counting");
      const duration = 1800; // longer duration
      const startTime = performance.now();
      let raf: number;

      const animate = (time: number) => {
        const elapsed = time - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease-out cubic for fast start, smooth slow finish
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
    }, 300);

    return () => clearTimeout(delayTimer);
  }, [orderTotal, startValue]);

  const showBounce = phase === "done";

  return (
    <div className="checkout-card px-3 py-2 space-y-1">
      {/* Price display */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">სულ გადასახდელი</span>
        <div className="flex items-baseline gap-1.5">
          {phase === "done" && oldTotal > 0 && (
            <span className="text-xs text-muted-foreground line-through animate-fade-in">
              {oldTotal.toFixed(1)}₾
            </span>
          )}
          <span
            className={`text-xl font-extrabold text-primary transition-transform duration-300 ${
              showBounce ? "animate-checkout-bounce" : ""
            }`}
            style={showBounce ? { textShadow: "0 0 10px hsl(var(--primary) / 0.3)" } : undefined}
          >
            {displayValue.toFixed(1)}₾
          </span>
        </div>
      </div>

      {/* Savings badge + micro reinforcement inline */}
      {phase === "done" && (
        <div className="flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 text-[9px] font-semibold text-success">
              <Truck className="w-2.5 h-2.5" />
              <span>უფასო მიწოდება</span>
            </div>
            <div className="flex items-center gap-0.5 text-[9px] font-semibold text-muted-foreground">
              <CreditCard className="w-2.5 h-2.5" />
              <span>კურიერთან</span>
            </div>
          </div>
          {savings > 0 && (
            <span className="text-[10px] font-bold bg-deal text-deal-foreground px-2 py-0.5 rounded inline-flex items-center gap-0.5">
              დაზოგე {savings.toFixed(1)}₾ 🎉
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export default CheckoutPriceReveal;
