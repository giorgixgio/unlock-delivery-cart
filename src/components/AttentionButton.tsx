import React, { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface AttentionButtonProps {
  isBelowThreshold: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}

/**
 * Temu-style bounce + pulse CTA with a tapping cursor icon.
 * - Animates on mount when below threshold
 * - Re-animates on every click while below threshold
 * - Cursor SVG taps the button with a delayed bounce
 * - 3 repetitions, then stops. Re-triggers on click.
 * - Respects prefers-reduced-motion
 */
const AttentionButton = ({ isBelowThreshold, onClick, children, className }: AttentionButtonProps) => {
  const [animKey, setAnimKey] = useState(0);
  const [showCursor, setShowCursor] = useState(false);
  const reducedMotion = useRef(false);
  const mountedBelow = useRef(false);

  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Auto-trigger on mount / when becoming below threshold
  useEffect(() => {
    if (isBelowThreshold && !reducedMotion.current) {
      if (!mountedBelow.current) {
        mountedBelow.current = true;
        // Small delay so the element is visible first
        const t = setTimeout(() => {
          setAnimKey((k) => k + 1);
          setShowCursor(true);
        }, 400);
        return () => clearTimeout(t);
      }
    } else {
      mountedBelow.current = false;
      setShowCursor(false);
    }
  }, [isBelowThreshold]);

  const handleClick = () => {
    onClick();
    if (isBelowThreshold && !reducedMotion.current) {
      // Re-trigger animation
      setAnimKey((k) => k + 1);
      setShowCursor(true);
    }
  };

  const handleAnimEnd = (e: React.AnimationEvent) => {
    // Only respond to the bounce animation ending (not cursor)
    if (e.animationName === "attention-bounce") {
      setShowCursor(false);
    }
  };

  const isAnimating = animKey > 0 && isBelowThreshold;

  return (
    <button
      onClick={handleClick}
      className={cn(
        "relative w-full font-bold rounded-xl flex items-center justify-center gap-2 transition-colors duration-200 will-change-transform",
        isAnimating && "attention-bounce",
        className,
      )}
      key={`attn-${animKey}`}
      onAnimationEnd={handleAnimEnd}
    >
      {children}
      {showCursor && (
        <span className="absolute right-4 bottom-1 attention-cursor pointer-events-none z-10">
          <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 1L6 15L9.5 12L13 19.5L15.5 18.5L12 11.5L16.5 11L6 1Z" fill="white" stroke="hsl(var(--foreground))" strokeWidth="1.2" strokeLinejoin="round"/>
          </svg>
        </span>
      )}
    </button>
  );
};

export default AttentionButton;
