import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { cn } from "@/lib/utils";

const MAX_SLOTS = 5;
const PARTICLE_COLORS = ["#ff6a00","#ff9500","#ffd700","#ff3300","#ffcc00","#fff","#ff4500"];

type Phase = "mission" | "unlock" | "upgrade";

interface Particle {
  id: number;
  style: React.CSSProperties;
}

function makeParticles(n: number): Particle[] {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    style: {
      "--dx": `${(Math.random() - 0.5) * 300}px`,
      "--dy": `${-(Math.random() * 150 + 50)}px`,
      "--rot": `${Math.random() * 720 - 360}deg`,
      background: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
      width: `${Math.random() * 8 + 5}px`,
      height: `${Math.random() * 8 + 5}px`,
      borderRadius: Math.random() > 0.5 ? "50%" : "2px",
      left: `${Math.random() * 80 + 10}%`,
      top: "40%",
      animationDelay: `${Math.random() * 0.2}s`,
      boxShadow: `0 0 6px ${PARTICLE_COLORS[i % PARTICLE_COLORS.length]}`,
    } as React.CSSProperties,
  }));
}

// ── Hook Line ──────────────────────────────────────────────
const HookLine = ({ itemCount, threshold, remaining }: {
  itemCount: number; threshold: number; remaining: number;
}) => {
  const unlocked = itemCount >= threshold;
  const extra = itemCount - threshold;

  if (unlocked && extra >= 2) return (
    <div className="text-center mb-[11px]">
      <span className="text-sm font-bold text-[#e8e8e8] leading-snug">
        🔥 მეტი პროდუქტი — <b className="text-[#ff6a00] font-black not-italic neon-text-orange">მეტი სარგებელი</b>
      </span>
    </div>
  );

  if (unlocked) return (
    <div className="text-center mb-[11px]">
      <span className="text-sm font-black text-[#39ff14] neon-text-green">
        ✅ შეთავაზება გახსნილია — გააგრძელე!
      </span>
    </div>
  );

  if (remaining === 1) return (
    <div className="text-center mb-[11px]">
      <span className="text-sm font-bold text-[#e8e8e8] leading-snug">
        ⚡ კიდევ <b className="text-[#ff6a00] font-black not-italic neon-text-orange">1 პროდუქტი</b> — და გახსნი შეთავაზებას!
      </span>
    </div>
  );

  return (
    <div className="text-center mb-[11px]">
      <span className="text-sm font-bold text-[#e8e8e8] leading-snug">
        🔥 აირჩიე <b className="text-[#ff6a00] font-black not-italic neon-text-orange">{threshold} პროდუქტი</b> — მიიღე ფასდაკლება + ბონუსი
      </span>
    </div>
  );
};

// ── Slot Row ───────────────────────────────────────────────
const SlotRow = ({ itemCount, threshold, lastFilled }: {
  itemCount: number; threshold: number; lastFilled: number;
}) => (
  <div className="flex gap-[7px] mb-[9px]">
    {Array.from({ length: threshold }).map((_, i) => {
      const filled = i < itemCount;
      const active = i === itemCount && itemCount < threshold;
      const locked = !filled && !active;
      const isNew = i === lastFilled;

      return (
        <div
          key={i}
          className={cn(
            "flex-1 rounded-[10px] pt-[9px] px-1 pb-2 flex flex-col items-center gap-[3px] transition-all duration-300 relative overflow-hidden",
            filled && "neon-slot-filled",
            active && "neon-slot-active",
            locked && "neon-slot-locked opacity-50"
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
            className="text-xl font-black leading-none"
            style={{
              color: filled ? "#ff6a00" : active ? "#ff6a00" : "#2a2a2a",
              textShadow: filled
                ? "0 0 8px rgba(255,106,0,.9), 0 0 20px rgba(255,106,0,.5)"
                : active
                ? "0 0 6px rgba(255,106,0,.6)"
                : "none",
            }}
          >
            {filled ? "✓" : active ? i + 1 : "🔒"}
          </span>
          <span
            className="text-[9px] font-bold uppercase tracking-wide text-center"
            style={{
              color: filled ? "#ff6a00" : active ? "#cc4400" : "#2a2a2a",
            }}
          >
            {filled ? "დაემატა" : active ? "შემდეგი" : `${i + 1}-ე`}
          </span>
        </div>
      );
    })}
  </div>
);

// ── Progress Bar ───────────────────────────────────────────
const NeonProgressBar = ({ pct, empty }: { pct: number; empty: boolean }) => (
  <div className="mb-2">
    <div className="relative h-2 rounded-full overflow-hidden neon-bar-track">
      {/* Empty shimmer */}
      {empty && (
        <>
          <div className="absolute inset-0 rounded-full neon-ghost-glow" />
          <div className="absolute top-0 w-[55%] h-full rounded-full neon-empty-shimmer" />
        </>
      )}
      {/* Filling */}
      {!empty && pct < 100 && (
        <>
          <div
            className="absolute left-0 top-0 h-full rounded-full overflow-hidden neon-bar-fill"
            style={{ width: `${pct}%` }}
          >
            <div className="absolute top-0 -left-[60%] w-1/2 h-full rounded-full neon-shimmer-slide" />
          </div>
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[14px] h-[14px] rounded-full neon-bar-head"
            style={{ left: `calc(${pct}% - 7px)` }}
          />
        </>
      )}
      {/* Complete */}
      {pct >= 100 && (
        <div className="absolute inset-0 rounded-full overflow-hidden neon-bar-complete">
          <div className="absolute top-0 -left-[60%] w-1/2 h-full rounded-full neon-shimmer-slide" />
        </div>
      )}
    </div>
  </div>
);

// ── Sub Line ───────────────────────────────────────────────
const SubLine = ({ itemCount, remaining }: { itemCount: number; remaining: number }) => {
  const msg = itemCount === 0
    ? "აირჩიე პირველი პროდუქტი ↓"
    : remaining === 1
    ? "კიდევ 1 — თითქმის მიაღწიე! ↓"
    : `კიდევ ${remaining} პროდუქტი ↓`;

  return (
    <div className="text-center text-[11px] text-[#444] mb-[9px] font-semibold tracking-tight">
      {msg}
    </div>
  );
};

// ── Upgrade Layer ──────────────────────────────────────────
const UpgradeLayer = ({ itemCount, threshold, lastFilled, exploding, aovMax }: {
  itemCount: number; threshold: number; lastFilled: number; exploding: boolean; aovMax: number;
}) => (
  <>
    <div className="flex items-center justify-center gap-1.5 mb-[9px] rounded-[10px] py-1.5 px-3 neon-upgrade-nudge">
      <span className="text-[13px]">➕</span>
      <span className="text-xs text-[#997722] font-semibold">
        დაამატე კიდევ — <b className="text-[#ffd700] font-extrabold not-italic neon-text-gold">გაზარდე სარგებელი</b>
      </span>
    </div>

    <div className="flex gap-[7px] mb-[9px]">
      {Array.from({ length: aovMax }).map((_, i) => {
        const filled = i < itemCount;
        const isCore = i < threshold;
        const isNext = i === itemCount;
        const isNew = i === lastFilled;

        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-[10px] pt-[9px] px-1 pb-2 flex flex-col items-center gap-[3px] transition-all duration-300 relative overflow-hidden",
              filled && isCore && "neon-slot-filled",
              filled && !isCore && "neon-slot-bonus",
              isNext && "neon-slot-next-bonus",
              !filled && !isNext && isCore && "neon-slot-locked",
              !filled && !isNext && !isCore && "neon-slot-locked-bonus"
            )}
            style={{
              transform: !isCore && !filled ? "scale(0.92)" : "scale(1)",
              animation: isNew
                ? "slotPop .55s cubic-bezier(0.34,1.56,0.64,1)"
                : exploding && filled && isCore
                ? "slotGlow .6s ease-in-out infinite alternate"
                : "none",
            }}
          >
            <span
              className="font-black leading-none"
              style={{
                fontSize: !isCore ? 14 : 20,
                color: filled ? (isCore ? "#ff6a00" : "#ffd700") : isNext ? "#cc9900" : "#1a1a1a",
                textShadow: filled && isCore
                  ? "0 0 8px rgba(255,106,0,.9), 0 0 20px rgba(255,106,0,.4)"
                  : filled && !isCore
                  ? "0 0 8px rgba(255,215,0,.8)"
                  : "none",
              }}
            >
              {filled ? (isCore ? "✓" : "★") : isNext ? "+" : "·"}
            </span>
            <span
              className="text-[9px] font-bold uppercase tracking-wide text-center"
              style={{
                color: filled ? (isCore ? "#ff6a00" : "#cc9900") : isNext ? "#996600" : "#1a1a1a",
              }}
            >
              {filled ? (isCore ? "დამატდა" : "ბონუსი!") : isNext ? "დაამატე" : `+${i + 1 - threshold}`}
            </span>
          </div>
        );
      })}
    </div>

    <div className="text-center text-[10px] text-[#333] mb-2 italic">
      💡 ხშირად ყიდულობენ 4–5 პროდუქტს ერთად
    </div>
  </>
);

// ═══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════
const MissionHeroStrip = () => {
  const { itemCount, threshold, isUnlocked } = useCart();
  const { openCart } = useCartOverlay();

  const effectiveThreshold = threshold || 3;
  const remaining = Math.max(0, effectiveThreshold - itemCount);
  const pct = Math.min(100, (itemCount / effectiveThreshold) * 100);

  const [phase, setPhase] = useState<Phase>(
    itemCount >= effectiveThreshold ? "upgrade" : "mission"
  );
  const [showUpgrade, setShowUpgrade] = useState(itemCount >= effectiveThreshold);
  const [lastFilled, setLastFilled] = useState(-1);
  const [exploding, setExploding] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const prevCount = useRef(itemCount);

  // Phase & animation management
  useEffect(() => {
    if (itemCount > prevCount.current) {
      const idx = itemCount - 1;
      setLastFilled(idx);
      setTimeout(() => setLastFilled(-1), 650);

      if (itemCount === effectiveThreshold) {
        setPhase("unlock");
        setExploding(true);
        setParticles(makeParticles(24));
        setTimeout(() => setExploding(false), 2400);
        setTimeout(() => setParticles([]), 2400);
        setTimeout(() => {
          setPhase("upgrade");
          setShowUpgrade(true);
        }, 850);
      }
    }

    if (itemCount < effectiveThreshold) {
      setPhase("mission");
      setShowUpgrade(false);
    } else if (itemCount >= effectiveThreshold && phase === "mission") {
      setPhase("upgrade");
      setShowUpgrade(true);
    }

    prevCount.current = itemCount;
  }, [itemCount, effectiveThreshold, phase]);

  // Scroll-shrink
  const [shrunk, setShrunk] = useState(false);
  const forceExpandUntil = useRef(0);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (itemCount > 0 && itemCount !== prevCount.current) {
      forceExpandUntil.current = Date.now() + 2000;
      setShrunk(false);
    }
  }, [itemCount]);

  const onScroll = useCallback(() => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
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

  const unlocked = itemCount >= effectiveThreshold;

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

      {/* Neon mission strip */}
      <div
        className={cn(
          "transition-all duration-300 overflow-hidden relative",
          shrunk ? "max-h-[50px]" : "max-h-[300px]"
        )}
        style={{
          background: "#0a0a0a",
          borderBottom: "2px solid #ff4500",
          boxShadow: "0 4px 32px rgba(255,106,0,.22), inset 0 -1px 0 rgba(255,106,0,.15)",
        }}
      >
        {/* Confetti particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute pointer-events-none"
            style={{
              ...p.style,
              animation: "confettiFly 2.2s ease-out forwards",
            }}
          />
        ))}

        <div className={cn(
          "container max-w-2xl mx-auto transition-all duration-300",
          shrunk ? "px-4 py-1.5" : "px-4 pt-[13px] pb-[11px]"
        )}>
          {/* Shrunk state — compact single line */}
          {shrunk ? (
            <p className="text-[11px] font-bold text-center truncate"
              style={{ color: unlocked ? "#39ff14" : "#e8e8e8" }}
            >
              {unlocked
                ? "✅ შეთავაზება გახსნილია"
                : `🔥 კიდევ ${remaining} პროდუქტი — ${itemCount}/${effectiveThreshold}`
              }
            </p>
          ) : (
            <>
              <HookLine itemCount={itemCount} threshold={effectiveThreshold} remaining={remaining} />

              {/* Mission phase */}
              {!unlocked && (
                <>
                  <SlotRow itemCount={itemCount} threshold={effectiveThreshold} lastFilled={lastFilled} />
                  <NeonProgressBar pct={pct} empty={itemCount === 0} />
                  <SubLine itemCount={itemCount} remaining={remaining} />
                </>
              )}

              {/* Unlock flash */}
              {unlocked && !showUpgrade && (
                <div className="flex items-center justify-center gap-2 mb-[10px]">
                  <span className="text-2xl">🎉</span>
                  <span className="text-base font-black text-[#39ff14] neon-text-green">
                    შეთავაზება გახსნილია!
                  </span>
                </div>
              )}

              {/* Upgrade phase */}
              {unlocked && showUpgrade && (
                <UpgradeLayer
                  itemCount={itemCount}
                  threshold={effectiveThreshold}
                  lastFilled={lastFilled}
                  exploding={exploding}
                  aovMax={MAX_SLOTS}
                />
              )}

              {/* Bottom trust row */}
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs font-bold text-[#666]">🚚 გადახდა მიღებისას</span>
                <span className="text-xs text-[#222]">•</span>
                <span className="flex items-center gap-[5px] text-xs font-bold text-[#ff6a00] neon-text-orange">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff6a00] inline-block neon-blink"
                    style={{ boxShadow: "0 0 6px #ff6a00, 0 0 12px rgba(255,106,0,.5)" }}
                  />
                  სწრაფად იწურება
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MissionHeroStrip;
