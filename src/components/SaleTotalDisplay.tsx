import { useMemo, useState, useEffect, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import AnimatedNumber from "@/components/AnimatedNumber";

interface SaleTotalDisplayProps {
  /** Run the dopamine "price reveal" animation on mount */
  animateOnMount?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

/**
 * Displays cart total with sale styling:
 * - If compareAtPrice exists on items, shows old total strikethrough + savings badge
 * - Otherwise shows just the total
 * - Optional one-shot price-reveal animation on mount
 */
const SaleTotalDisplay = ({ animateOnMount = false, className = "", size = "md" }: SaleTotalDisplayProps) => {
  const { items, total } = useCart();

  const oldTotal = useMemo(() => {
    let sum = 0;
    let hasAnyCompare = false;
    for (const { product, quantity } of items) {
      if (product.compareAtPrice && product.compareAtPrice > product.price) {
        sum += product.compareAtPrice * quantity;
        hasAnyCompare = true;
      } else {
        sum += product.price * quantity;
      }
    }
    return hasAnyCompare ? sum : null;
  }, [items]);

  const savings = oldTotal ? oldTotal - total : 0;
  const savingsPercent = oldTotal ? Math.round((savings / oldTotal) * 100) : 0;
  const hasSale = oldTotal !== null && savings > 0;

  // One-shot animation state
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

  const sizeClasses = {
    sm: { total: "text-base", old: "text-xs", badge: "text-[10px] px-1.5 py-0.5" },
    md: { total: "text-xl", old: "text-sm", badge: "text-xs px-2 py-0.5" },
    lg: { total: "text-2xl", old: "text-base", badge: "text-sm px-2.5 py-1" },
  }[size];

  // During counting phase, show rolling number
  if (phase === "counting" && hasSale) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <span className={`${sizeClasses.total} font-extrabold text-foreground animate-scale-in`}>
          <AnimatedNumber value={total} duration={800} /> ₾
        </span>
      </div>
    );
  }

  // Strike phase: show old total getting struck through
  if (phase === "strike" && hasSale) {
    return (
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        <span className={`${sizeClasses.old} text-muted-foreground line-through animate-fade-in`}>
          {oldTotal!.toFixed(1)} ₾
        </span>
        <span className={`${sizeClasses.total} font-extrabold text-primary animate-scale-in`}>
          {total.toFixed(1)} ₾
        </span>
      </div>
    );
  }

  // Reveal / done phase
  const showBlink = phase === "reveal";

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className} ${showBlink ? "animate-sale-highlight" : ""}`}>
      {hasSale && (
        <span className={`${sizeClasses.old} text-muted-foreground line-through`}>
          {oldTotal!.toFixed(1)} ₾
        </span>
      )}
      <span className={`${sizeClasses.total} font-extrabold text-primary`}>
        {total.toFixed(1)} ₾
      </span>
      {hasSale && phase === "done" && (
        <span className={`${sizeClasses.badge} bg-deal text-deal-foreground font-bold rounded animate-fade-in`}>
          -{savingsPercent}% (₾{savings.toFixed(1)})
        </span>
      )}
    </div>
  );
};

export default SaleTotalDisplay;
