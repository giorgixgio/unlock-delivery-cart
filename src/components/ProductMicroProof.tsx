import { useState, useEffect, memo } from "react";
import { getMicroProofRotation } from "@/lib/socialProofEngine";
import { Product } from "@/lib/constants";

interface Props {
  product: Product;
  className?: string;
  /** Max characters before truncation. Default 40 */
  maxChars?: number;
  /** Number of visible lines. Default 2 */
  lines?: 1 | 2;
}

/** Compact urgency/micro-proof messages mapped to shorter versions */
const COMPACT_MAP: Record<string, string> = {
  "ბოლო 24სთ-ში პოპულარულია": "⏰ 24სთ-ში პოპულარული",
  "ბოლო დარჩა 24სთ-ში": "⏰ ბოლო 24სთ-ში",
};

function compactText(text: string, maxChars: number): string {
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
 * Rotating micro-proof / urgency text under product cards.
 * Fixed-height 2-line area (default) to prevent card height jumping.
 */
const ProductMicroProof = memo(({ product, className = "", maxChars = 40, lines = 2 }: Props) => {
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

  // Fixed height: 2 lines = 2 * 14px leading = 28px; 1 line = 14px
  const heightClass = lines === 2 ? "h-[28px]" : "h-[14px]";
  const clampClass = lines === 2 ? "line-clamp-2" : "line-clamp-1";

  return (
    <div className={`${heightClass} overflow-hidden mt-1 ${className}`}>
      <p
        className={`text-[10px] font-semibold text-muted-foreground leading-[14px] ${clampClass} transition-opacity duration-200 ${
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
