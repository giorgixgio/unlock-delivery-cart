import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { ShoppingCart, Sparkles, ChevronDown, Gift, TrendingUp } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { cn } from "@/lib/utils";

const MAX_SLOTS = 5;
const CORE_THRESHOLD = 3;

type Phase = "mission" | "unlock" | "upgrade";

const MissionHeroStrip = () => {
  const { itemCount, threshold, isUnlocked } = useCart();
  const { openCart } = useCartOverlay();
  const [phase, setPhase] = useState<Phase>("mission");
  const [showConfetti, setShowConfetti] = useState(false);
  const prevCount = useRef(itemCount);
  const [slotPop, setSlotPop] = useState<number | null>(null);

  const effectiveThreshold = threshold || CORE_THRESHOLD;
  const remaining = Math.max(0, effectiveThreshold - itemCount);
  const progress = Math.min(100, (itemCount / effectiveThreshold) * 100);

  // Phase management
  useEffect(() => {
    if (itemCount < effectiveThreshold) {
      setPhase("mission");
    } else if (itemCount >= effectiveThreshold && prevCount.current < effectiveThreshold) {
      // Just crossed threshold
      setPhase("unlock");
      setShowConfetti(true);
      const t = setTimeout(() => {
        setPhase("upgrade");
        setShowConfetti(false);
      }, 2200);
      prevCount.current = itemCount;
      return () => clearTimeout(t);
    } else if (itemCount >= effectiveThreshold) {
      setPhase("upgrade");
    }
    prevCount.current = itemCount;
  }, [itemCount, effectiveThreshold]);

  // Slot pop animation
  useEffect(() => {
    if (itemCount > 0 && itemCount !== prevCount.current) {
      setSlotPop(itemCount);
      const t = setTimeout(() => setSlotPop(null), 400);
      return () => clearTimeout(t);
    }
  }, [itemCount]);

  // Scroll-shrink + auto-expand on meaningful changes
  const [shrunk, setShrunk] = useState(false);
  const forceExpandUntil = useRef(0);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  // Auto-expand hero on meaningful state changes
  useEffect(() => {
    if (itemCount > 0 && itemCount !== prevCount.current) {
      // Force expand for 2 seconds on every add / threshold cross
      forceExpandUntil.current = Date.now() + 2000;
      setShrunk(false);
    }
  }, [itemCount]);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      // Skip shrink if force-expanded
      if (Date.now() < forceExpandUntil.current) {
        ticking.current = false;
        return;
      }
      const y = window.scrollY;
      if (y > 100 && y > lastScrollY.current + 10) setShrunk(true);
      else if (y < lastScrollY.current - 10 || y < 50) setShrunk(false);
      lastScrollY.current = y;
      ticking.current = false;
    });
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  // --- COPY ---
  const hookCopy = useMemo(() => {
    if (phase === "unlock") return "🎉 შეთავაზება გახსნილია!";
    if (phase === "upgrade") return "🔥 მეტი პროდუქტი — მეტი სარგებელი";
    if (remaining === 1) return "⚡ კიდევ 1 პროდუქტი — და გახსნი შეთავაზებას!";
    return `🔥 აირჩიე ${effectiveThreshold} პროდუქტი — მიიღე ფასდაკლება + ბონუსი`;
  }, [phase, remaining, effectiveThreshold]);

  const directionCopy = useMemo(() => {
    if (phase === "upgrade") return "➕ დაამატე კიდევ 1–2 პროდუქტი — შეკვეთა უფრო მომგებიანი გახდება";
    if (itemCount === 0) return "აირჩიე პირველი პროდუქტი ↓";
    if (remaining === 1) return "კიდევ 1 პროდუქტი — თითქმის მიაღწიე! ↓";
    return `კიდევ ${remaining} პროდუქტი — შემდეგ ↓`;
  }, [phase, itemCount, remaining]);

  const slotsToShow = phase === "upgrade" ? MAX_SLOTS : effectiveThreshold;

  return (
    <div className="sticky top-0 z-40">
      {/* Brand bar */}
      <div className="bg-card border-b border-border shadow-sm">
        <div className="container max-w-2xl mx-auto px-3 flex items-center gap-2 h-11">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex-shrink-0 font-extrabold tracking-tight text-lg text-primary"
          >
            BigMart
          </button>
          <div className="flex-1" />
          <button
            onClick={() => openCart()}
            className="p-1.5 rounded-full hover:bg-muted transition-colors relative"
            aria-label="კალათა"
          >
            <ShoppingCart className="w-5 h-5 text-foreground" />
            {itemCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 bg-primary text-primary-foreground text-[10px] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center px-1 leading-none">
                {itemCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Mission strip */}
      <div
        className={cn(
          "transition-all duration-300 overflow-hidden",
          shrunk ? "max-h-[80px]" : "max-h-[220px]"
        )}
        style={{ background: "hsl(220 15% 13%)" }}
      >
        <div className={cn(
          "container max-w-2xl mx-auto px-3 transition-all duration-300",
          shrunk ? "py-2" : "py-3"
        )}>
          {/* Hook copy */}
          <p className={cn(
            "font-extrabold text-white leading-tight transition-all duration-300",
            shrunk ? "text-[12px]" : "text-[13px]",
            phase === "unlock" && "text-[hsl(145,63%,50%)]"
          )}>
            {hookCopy}
          </p>

          {/* Confetti burst */}
          {showConfetti && (
            <div className="flex justify-center gap-1 my-1 animate-fade-in">
              {["🎊", "✨", "🎉", "⭐", "🎊"].map((e, i) => (
                <span
                  key={i}
                  className="text-sm animate-bounce"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {e}
                </span>
              ))}
            </div>
          )}

          {/* Slot row */}
          {!shrunk && (
            <div className="flex items-center gap-1.5 mt-2">
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
                      "flex-1 rounded-lg flex flex-col items-center justify-center transition-all duration-300",
                      shrunk ? "h-6" : "h-10",
                      isFilled && !isBonus && "bg-primary/90 shadow-[0_0_8px_hsl(14,90%,52%,0.4)]",
                      isFilled && isBonus && "bg-[hsl(45,100%,50%)]/80 shadow-[0_0_8px_hsl(45,100%,50%,0.3)]",
                      isActive && !isBonus && "border-2 border-primary/70 bg-primary/10 animate-pulse",
                      isActive && isBonus && "border-2 border-[hsl(45,100%,50%)]/50 bg-[hsl(45,100%,50%)]/10 animate-pulse",
                      !isFilled && !isActive && !isBonus && "bg-white/8 border border-white/15",
                      !isFilled && !isActive && isBonus && "bg-white/5 border border-white/10",
                      isPopping && "scale-110"
                    )}
                  >
                    {!shrunk && (
                      <>
                        {isFilled ? (
                          isBonus ? (
                            <Gift className="w-3 h-3 text-[hsl(45,100%,25%)]" />
                          ) : (
                            <Sparkles className="w-3 h-3 text-primary-foreground" />
                          )
                        ) : isActive ? (
                          <ChevronDown className={cn(
                            "w-3 h-3",
                            isBonus ? "text-[hsl(45,100%,50%)]" : "text-primary"
                          )} />
                        ) : null}
                        <span className={cn(
                          "text-[8px] font-bold leading-none mt-0.5 truncate max-w-full px-0.5",
                          isFilled && !isBonus && "text-primary-foreground",
                          isFilled && isBonus && "text-[hsl(45,100%,20%)]",
                          isActive && "text-white/80",
                          !isFilled && !isActive && "text-white/30"
                        )}>
                          {label}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Progress bar */}
          <div className={cn(
            "relative rounded-full overflow-hidden bg-white/10 transition-all duration-300",
            shrunk ? "h-1.5 mt-1.5" : "h-2 mt-2"
          )}>
            {/* Shimmer background on fill */}
            <div
              className="absolute inset-0 h-full rounded-full transition-[width] duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: phase === "upgrade"
                  ? "linear-gradient(90deg, hsl(145,63%,42%), hsl(145,63%,50%))"
                  : "linear-gradient(90deg, hsl(14,90%,45%), hsl(14,90%,58%))"
              }}
            />
            {/* Glowing head */}
            {phase === "mission" && progress > 0 && progress < 100 && (
              <div
                className="absolute top-0 h-full w-3 rounded-full animate-pulse"
                style={{
                  left: `calc(${progress}% - 6px)`,
                  background: "radial-gradient(circle, hsl(14,90%,65%), transparent)",
                }}
              />
            )}
          </div>

          {/* Direction / upgrade copy */}
          {!shrunk && (
            <div className="mt-2 space-y-1">
              <p className={cn(
                "text-[11px] font-semibold leading-tight",
                phase === "upgrade" ? "text-[hsl(145,63%,55%)]" : "text-white/70"
              )}>
                {directionCopy}
              </p>

              {/* Social proof in upgrade mode */}
              {phase === "upgrade" && (
                <p className="text-[10px] text-white/50 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  💡 ხშირად ყიდულობენ 4–5 პროდუქტს ერთად
                </p>
              )}

              {/* Trust line */}
              <p className="text-[10px] text-white/40">
                🚚 გადახდა მიღებისას • 🔥 სწრაფად იწურება
              </p>
            </div>
          )}

          {/* Cart CTA in upgrade mode */}
          {phase === "upgrade" && !shrunk && (
            <button
              onClick={() => openCart()}
              className="w-full mt-2 py-2 rounded-lg font-bold text-sm text-white transition-all duration-200"
              style={{ background: "hsl(145,63%,42%)" }}
            >
              კალათაზე გადასვლა →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionHeroStrip;
