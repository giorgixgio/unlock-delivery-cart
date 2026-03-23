import { useMemo, useEffect, useState, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";

const CORE_THRESHOLD = 3;
const MAX_SLOTS = 5;

/**
 * Compact neon-dark mission bar for inside sheets/drawers.
 */
const MiniMissionBar = () => {
  const { itemCount, threshold, isUnlocked } = useCart();
  const effectiveThreshold = threshold || CORE_THRESHOLD;
  const remaining = Math.max(0, effectiveThreshold - itemCount);
  const pct = Math.min(100, (itemCount / effectiveThreshold) * 100);
  const isUpgrade = itemCount >= effectiveThreshold;

  // Slot pop animation
  const [lastFilled, setLastFilled] = useState(-1);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setLastFilled(itemCount - 1);
      const t = setTimeout(() => setLastFilled(-1), 650);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    }
    prevCount.current = itemCount;
  }, [itemCount]);

  // Unlock glow
  const [showGlow, setShowGlow] = useState(false);
  useEffect(() => {
    if (itemCount === effectiveThreshold && prevCount.current < effectiveThreshold) {
      setShowGlow(true);
      const t = setTimeout(() => setShowGlow(false), 1500);
      return () => clearTimeout(t);
    }
  }, [itemCount, effectiveThreshold]);

  // Hook copy
  const hookCopy = useMemo(() => {
    if (isUpgrade && itemCount >= 4)
      return "🔥 მეტი პროდუქტი — მეტი სარგებელი";
    if (isUpgrade)
      return "✅ შეთავაზება გახსნილია — გააგრძელე";
    if (remaining === 1)
      return "⚡ კიდევ 1 პროდუქტი — გახსნი შეთავაზებას";
    return `🔥 აირჩიე ${effectiveThreshold} პროდუქტი — მიიღე შეთავაზება`;
  }, [isUpgrade, remaining, effectiveThreshold, itemCount]);

  const directionCopy = useMemo(() => {
    if (isUpgrade) return "დაამატე მეტი — დაზოგავ მეტს";
    return `კიდევ ${remaining} პროდუქტი დარჩა ↓`;
  }, [isUpgrade, remaining]);

  const slotsToShow = isUpgrade ? MAX_SLOTS : effectiveThreshold;

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 space-y-1.5 transition-shadow duration-500",
        showGlow && "shadow-[0_0_20px_rgba(57,255,20,0.3)]"
      )}
      style={{
        background: "#0a0a0a",
        borderBottom: "2px solid #ff4500",
        boxShadow: showGlow
          ? "0 0 20px rgba(57,255,20,0.3)"
          : "0 2px 16px rgba(255,106,0,.15)",
      }}
    >
      {/* Hook line */}
      <p className={cn(
        "text-[11px] font-extrabold leading-tight",
        isUpgrade ? "text-[#39ff14] neon-text-green" : "text-[#e8e8e8]"
      )}>
        {hookCopy}
      </p>

      {/* Slot row */}
      <div className="flex items-center gap-1">
        {Array.from({ length: slotsToShow }).map((_, i) => {
          const filled = i < itemCount;
          const isBonus = i >= effectiveThreshold;
          const active = i === itemCount && i < slotsToShow;
          const locked = !filled && !active;
          const isNew = i === lastFilled;

          let label: string;
          if (filled && isBonus) label = "ბონუსი!";
          else if (filled) label = "დაემატა";
          else if (active && isBonus) label = "დაამატე";
          else if (active) label = "შემდეგი";
          else if (isBonus) label = `+${i + 1 - effectiveThreshold}`;
          else label = `${i + 1}-ე`;

          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-lg flex flex-col items-center justify-center h-8 transition-all duration-300 relative overflow-hidden",
                filled && !isBonus && "neon-slot-filled",
                filled && isBonus && "neon-slot-bonus",
                active && !isBonus && "neon-slot-active",
                active && isBonus && "neon-slot-next-bonus",
                locked && !isBonus && "neon-slot-locked opacity-50",
                locked && isBonus && "neon-slot-locked-bonus opacity-40",
              )}
              style={{
                animation: isNew
                  ? "slotPop .55s cubic-bezier(0.34,1.56,0.64,1)"
                  : active
                  ? "activePulse 2s ease-in-out infinite"
                  : "none",
              }}
            >
              {filled && (
                <div className="absolute top-0 left-0 right-0 h-[2px] opacity-90"
                  style={{ background: "linear-gradient(90deg, transparent, #ff6a00, transparent)" }}
                />
              )}
              <span
                className="text-xs font-black leading-none"
                style={{
                  color: filled ? (isBonus ? "#ffd700" : "#ff6a00") : active ? "#ff6a00" : "#2a2a2a",
                  textShadow: filled && !isBonus
                    ? "0 0 8px rgba(255,106,0,.9)"
                    : filled && isBonus
                    ? "0 0 8px rgba(255,215,0,.8)"
                    : "none",
                }}
              >
                {filled ? (isBonus ? "★" : "✓") : active ? i + 1 : "🔒"}
              </span>
              <span
                className="text-[7px] font-bold uppercase tracking-wide text-center"
                style={{
                  color: filled ? (isBonus ? "#cc9900" : "#ff6a00") : active ? "#cc4400" : "#2a2a2a",
                }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 rounded-full overflow-hidden neon-bar-track">
        {itemCount === 0 && (
          <>
            <div className="absolute inset-0 rounded-full neon-ghost-glow" />
            <div className="absolute top-0 w-[55%] h-full rounded-full neon-empty-shimmer" />
          </>
        )}
        {itemCount > 0 && pct < 100 && (
          <>
            <div
              className="absolute left-0 top-0 h-full rounded-full overflow-hidden neon-bar-fill"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute top-0 -left-[60%] w-1/2 h-full rounded-full neon-shimmer-slide" />
            </div>
          </>
        )}
        {pct >= 100 && (
          <div className="absolute inset-0 rounded-full overflow-hidden neon-bar-complete">
            <div className="absolute top-0 -left-[60%] w-1/2 h-full rounded-full neon-shimmer-slide" />
          </div>
        )}
      </div>

      {/* Direction text */}
      <p className={cn(
        "text-[9px] font-semibold leading-tight",
        isUpgrade ? "text-[#39ff14]" : "text-[#666]"
      )}>
        {directionCopy}
      </p>
    </div>
  );
};

export default MiniMissionBar;
