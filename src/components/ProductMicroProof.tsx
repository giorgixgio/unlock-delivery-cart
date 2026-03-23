import { useState, useEffect, memo } from "react";
import { getMicroProofRotation } from "@/lib/socialProofEngine";
import { Product } from "@/lib/constants";

interface Props {
  product: Product;
  className?: string;
  /** Max characters before truncation. Default 36 */
  maxChars?: number;
}

/** Compact urgency/micro-proof messages mapped to shorter versions */
const COMPACT_MAP: Record<string, string> = {
  "ბოლო 24სთ-ში პოპულარულია": "⏰ 24სთ-ში პოპულარული",
  "ბოლო დარჩა 24სთ-ში": "⏰ ბოლო 24სთ-ში",
};

function compactText(text: string, maxChars: number): string {
  // Try known compact replacements first
  for (const [long, short] of Object.entries(COMPACT_MAP)) {
    if (text.includes(long)) {
      text = text.replace(long, short);
    }
  }
  if (text.length > maxChars) {
    return text.slice(0, maxChars - 1) + "…";
  }
  return text;
}

/**
 * Rotating micro-proof text line under product cards.
 * Single line, truncated, with icon prefix.
 */
const ProductMicroProof = memo(({ product, className = "", maxChars = 36 }: Props) => {
  const [tick, setTick] = useState(0);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setTick(t => t + 1);
        setFading(false);
      }, 250);
    }, 4500 + Math.random() * 1500);
    return () => clearInterval(interval);
  }, []);

  const raw = getMicroProofRotation(product, tick);
  const text = compactText(raw, maxChars);

  return (
    <div className={`h-4 overflow-hidden mt-1 ${className}`}>
      <p
        className={`text-[10px] font-semibold text-muted-foreground leading-4 whitespace-nowrap overflow-hidden text-ellipsis transition-opacity duration-200 ${
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
