import { useMemo } from "react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";

/**
 * Compact mission progress bar for use inside sheets/drawers.
 * Shares cart state with the main MissionHeroStrip — no separate logic.
 */
const MiniMissionBar = () => {
  const { itemCount, threshold, isUnlocked } = useCart();
  const remaining = Math.max(0, threshold - itemCount);
  const progress = Math.min(100, (itemCount / threshold) * 100);

  const message = useMemo(() => {
    if (isUnlocked && itemCount > threshold)
      return "💰 მეტი პროდუქტი — მეტი დაზოგვა";
    if (isUnlocked) return "🎉 უფასო მიწოდება გააქტიურდა!";
    if (remaining === 1) return "⚡ კიდევ 1 პროდუქტი — გახსნი შეთავაზებას";
    return `🔥 კიდევ ${remaining} პროდუქტი — გახსნი შეთავაზებას`;
  }, [isUnlocked, remaining, itemCount, threshold]);

  const hint = useMemo(() => {
    if (isUnlocked) return null;
    return "🎁 ბონუსი გელოდება";
  }, [isUnlocked]);

  // Compact step dots
  const dots = Array.from({ length: Math.min(threshold + 2, 5) }, (_, i) => i + 1);

  return (
    <div
      className="rounded-lg px-3 py-2 space-y-1.5"
      style={{ background: "hsl(220 15% 13%)" }}
    >
      {/* Message row */}
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "text-[11px] font-bold leading-tight",
            isUnlocked ? "text-[hsl(145,63%,55%)]" : "text-white"
          )}
        >
          {message}
        </p>
        {hint && (
          <span className="text-[9px] font-semibold text-[hsl(45,100%,65%)] whitespace-nowrap flex-shrink-0">
            {hint}
          </span>
        )}
      </div>

      {/* Progress bar + step dots row */}
      <div className="flex items-center gap-2">
        {/* Compact dots */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {dots.map((step) => {
            const filled = step <= itemCount;
            const isBonus = step > threshold;
            return (
              <div
                key={step}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  filled && !isBonus && "bg-primary shadow-[0_0_4px_hsl(14,90%,52%,0.5)]",
                  filled && isBonus && "bg-[hsl(45,100%,50%)] shadow-[0_0_4px_hsl(45,100%,50%,0.4)]",
                  !filled && step === itemCount + 1 && "border border-primary/60 bg-primary/20",
                  !filled && step !== itemCount + 1 && "bg-white/15"
                )}
              />
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{
              width: `${progress}%`,
              background: isUnlocked
                ? "linear-gradient(90deg, hsl(145,63%,42%), hsl(145,63%,50%))"
                : "linear-gradient(90deg, hsl(14,90%,45%), hsl(14,90%,58%))",
            }}
          />
        </div>

        {/* Count label */}
        <span className="text-[10px] font-bold text-white/60 flex-shrink-0 tabular-nums">
          {itemCount}/{threshold}
        </span>
      </div>
    </div>
  );
};

export default MiniMissionBar;
