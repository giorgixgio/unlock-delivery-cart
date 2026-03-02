import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AttentionButtonProps {
  isBelowThreshold: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Temu-style bounce + pulse CTA button.
 * Animates 3× when isBelowThreshold flips true or on click while below.
 * Includes a small cursor-pointer SVG that bounces with 200ms delay.
 * GPU-accelerated (transform-only), respects prefers-reduced-motion.
 */
const AttentionButton = ({ isBelowThreshold, onClick, children, className }: AttentionButtonProps) => {
  const [animating, setAnimating] = useState(false);
  const prevBelow = useRef(isBelowThreshold);
  const reducedMotion = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  const triggerAnimation = useCallback(() => {
    if (reducedMotion.current || animating) return;
    setAnimating(true);
  }, [animating]);

  // Trigger when isBelowThreshold becomes true
  useEffect(() => {
    if (isBelowThreshold && !prevBelow.current) {
      triggerAnimation();
    }
    prevBelow.current = isBelowThreshold;
  }, [isBelowThreshold, triggerAnimation]);

  const handleClick = () => {
    onClick();
    if (isBelowThreshold) {
      // Re-trigger on click if still below threshold
      setAnimating(false);
      requestAnimationFrame(() => triggerAnimation());
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "relative w-full font-bold rounded-xl flex items-center justify-center gap-2 transition-colors duration-200 will-change-transform",
        animating && "attention-bounce",
        className,
      )}
      onAnimationEnd={() => setAnimating(false)}
    >
      {children}
      {animating && isBelowThreshold && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 attention-cursor pointer-events-none">
          <svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5.5 0L5.5 14L8.5 11.5L11.5 18L14 17L11 10.5L15 10L5.5 0Z" fill="white" stroke="hsl(var(--foreground))" strokeWidth="1" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
    </button>
  );
};

export default AttentionButton;
