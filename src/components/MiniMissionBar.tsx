import { useMemo, useEffect, useState, useRef } from "react";
import { Sparkles, ChevronDown, Gift } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";

const CORE_THRESHOLD = 3;
const MAX_SLOTS = 5;

/**
 * Compact "high-energy" hero for inside sheets/drawers.
 * Same gamification as grid MissionHeroStrip, compressed to ~60–70% height.
 */
const MiniMissionBar = () => {
  const { itemCount, threshold, isUnlocked } = useCart();
  const effectiveThreshold = threshold || CORE_THRESHOLD;
  const remaining = Math.max(0, effectiveThreshold - itemCount);
  const progress = Math.min(100, (itemCount / effectiveThreshold) * 100);
  const isUpgrade = itemCount >= effectiveThreshold;

  // Slot pop animation
  const [slotPop, setSlotPop] = useState<number | null>(null);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount > prevCount.current && itemCount > 0) {
      setSlotPop(itemCount);
      const t = setTimeout(() => setSlotPop(null), 400);
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

  // Direction copy
  const directionCopy = useMemo(() => {
    if (isUpgrade) return "დაამატე მეტი — დაზოგავ მეტს";
    return `კიდევ ${remaining} პროდუქტი დარჩა ↓`;
  }, [isUpgrade, remaining]);

  const slotsToShow = isUpgrade ? MAX_SLOTS : effectiveThreshold;

  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5 space-y-1.5 transition-shadow duration-500",
        showGlow && "shadow-[0_0_20px_hsl(145,63%,50%,0.3)]"
      )}
      style={{ background: "hsl(220 15% 13%)" }}
    >
      {/* Hook line */}
      <p
        className={cn(
          "text-[11px] font-extrabold leading-tight",
          isUpgrade ? "text-[hsl(145,63%,55%)]" : "text-white"
        )}
      >
        {hookCopy}
      </p>

      {/* Slot row */}
      <div className="flex items-center gap-1">
        {Array.from({ length: slotsToShow }).map((_, i) => {
          const slotNum = i + 1;
          const isFilled = slotNum <= itemCount;
          const isActive = slotNum === itemCount + 1;
          const isBonus = slotNum > effectiveThreshold;
          const isPopping = slotPop === slotNum;

          let label: string;
          if (isFilled && isBonus) label = "ბონუსი!";
          else if (isFilled) label = "დამატდა";
          else if (isActive && isBonus) label = "+1 ბონუსი";
          else if (isActive) label = "შემდეგი →";
          else if (isBonus) label = `+${slotNum - effectiveThreshold}`;
          else label = `${slotNum}-ე`;

          return (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-md flex flex-col items-center justify-center h-8 transition-all duration-300",
                // Filled core
                isFilled && !isBonus && "bg-primary/90 shadow-[0_0_6px_hsl(14,90%,52%,0.4)]",
                // Filled bonus
                isFilled && isBonus && "bg-[hsl(45,100%,50%)]/80 shadow-[0_0_6px_hsl(45,100%,50%,0.3)]",
                // Active core
                isActive && !isBonus && "border-[1.5px] border-primary/70 bg-primary/10 animate-pulse",
                // Active bonus
                isActive && isBonus && "border-[1.5px] border-[hsl(45,100%,50%)]/50 bg-[hsl(45,100%,50%)]/10 animate-pulse",
                // Locked core
                !isFilled && !isActive && !isBonus && "bg-white/8 border border-white/15",
                // Locked bonus (smaller feel)
                !isFilled && !isActive && isBonus && "bg-white/5 border border-white/10 max-w-[80%] mx-auto",
                // Pop
                isPopping && "scale-110"
              )}
            >
              {isFilled ? (
                isBonus ? (
                  <Gift className="w-2.5 h-2.5 text-[hsl(45,100%,25%)]" />
                ) : (
                  <Sparkles className="w-2.5 h-2.5 text-primary-foreground" />
                )
              ) : isActive ? (
                <ChevronDown
                  className={cn(
                    "w-2.5 h-2.5",
                    isBonus ? "text-[hsl(45,100%,50%)]" : "text-primary"
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "text-[7px] font-bold leading-none mt-0.5 truncate max-w-full px-0.5",
                  isFilled && !isBonus && "text-primary-foreground",
                  isFilled && isBonus && "text-[hsl(45,100%,20%)]",
                  isActive && "text-white/80",
                  !isFilled && !isActive && "text-white/30"
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="relative h-1.5 rounded-full overflow-hidden bg-white/10">
        <div
          className="absolute inset-0 h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${progress}%`,
            background: isUpgrade
              ? "linear-gradient(90deg, hsl(145,63%,42%), hsl(145,63%,50%))"
              : "linear-gradient(90deg, hsl(14,90%,45%), hsl(14,90%,58%))",
          }}
        />
        {/* Glowing head */}
        {!isUpgrade && progress > 0 && progress < 100 && (
          <div
            className="absolute top-0 h-full w-2.5 rounded-full animate-pulse"
            style={{
              left: `calc(${progress}% - 5px)`,
              background: "radial-gradient(circle, hsl(14,90%,65%), transparent)",
            }}
          />
        )}
      </div>

      {/* Direction text */}
      <p
        className={cn(
          "text-[9px] font-semibold leading-tight",
          isUpgrade ? "text-[hsl(145,63%,55%)]" : "text-white/60"
        )}
      >
        {directionCopy}
      </p>
    </div>
  );
};

export default MiniMissionBar;
