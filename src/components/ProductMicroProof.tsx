import { useState, useEffect, memo } from "react";
import { getMicroProofRotation } from "@/lib/socialProofEngine";
import { Product } from "@/lib/constants";

interface Props {
  product: Product;
  className?: string;
}

/**
 * Rotating micro-proof text line under product cards.
 * Updates every 4-6s with smooth fade transition.
 */
const ProductMicroProof = memo(({ product, className = "" }: Props) => {
  const [tick, setTick] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setTick(t => t + 1);
        setFading(false);
      }, 250);
    }, 4500 + Math.random() * 1500); // 4.5-6s
    return () => clearInterval(interval);
  }, []);

  const text = getMicroProofRotation(product, tick);

  return (
    <div className={`h-4 overflow-hidden mt-1 ${className}`}>
      <p
        className={`text-[10px] font-semibold text-muted-foreground leading-4 truncate whitespace-nowrap overflow-hidden text-ellipsis max-w-full transition-opacity duration-250 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        {text}
      </p>
    </div>
  );
});

ProductMicroProof.displayName = "ProductMicroProof";
export default ProductMicroProof;
