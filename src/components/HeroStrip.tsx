import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
//  HeroStrip — Neon on Dark + Shimmer empty bar
// ─────────────────────────────────────────────────────────────────

const THRESHOLD = 3;
const AOV_MAX   = 5;

const NEON  = "#ff6a00";
const NEON2 = "#ff9500";
const GOLD  = "#ffd700";
const TRACK = "#161616";

export default function HeroStrip({ itemCount = 0, threshold = THRESHOLD }: { itemCount?: number; threshold?: number }) {
  const unlocked  = itemCount >= threshold;
  const remaining = Math.max(0, threshold - itemCount);
  const pct       = Math.min(100, (itemCount / threshold) * 100);
  const extra     = Math.max(0, itemCount - threshold);

  const prevCount    = useRef(itemCount);
  const [lastFilled,  setLastFilled]  = useState(-1);
  const [exploding,   setExploding]   = useState(false);
  const [particles,   setParticles]   = useState<Array<{ id: number; style: Record<string, string> }>>([]);
  const [showUpgrade, setShowUpgrade] = useState(itemCount >= threshold);

  useEffect(() => {
    if (itemCount > prevCount.current) {
      const idx = itemCount - 1;
      setLastFilled(idx);
      setTimeout(() => setLastFilled(-1), 650);
      if (itemCount === threshold) {
        setExploding(true);
        setParticles(makeParticles(24));
        setTimeout(() => setExploding(false), 2400);
        setTimeout(() => setParticles([]), 2400);
        setTimeout(() => setShowUpgrade(true), 850);
      }
    }
    prevCount.current = itemCount;
  }, [itemCount, threshold]);

  return (
    <div
      className="font-georgian sticky top-0 z-[100] overflow-hidden bg-[#0a0a0a] border-b-2 border-[#ff4500] px-4 pt-[13px] pb-[11px]"
      style={{
        boxShadow: "0 4px 32px rgba(255,106,0,.22), inset 0 -1px 0 rgba(255,106,0,.15)",
      }}
    >
      <style>{css}</style>

      {/* confetti */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none"
          style={{ ...p.style, animation: "confettiFly 2.2s ease-out forwards" }}
        />
      ))}

      {/* ── HOOK ── */}
      <HookLine itemCount={itemCount} threshold={threshold} remaining={remaining} />

      {/* ── MISSION PHASE ── */}
      {!unlocked && (
        <>
          <SlotRow
            itemCount={itemCount}
            threshold={threshold}
            lastFilled={lastFilled}
          />
          <ProgressBar pct={pct} empty={itemCount === 0} />
          <SubLine itemCount={itemCount} />
        </>
      )}

      {/* ── UNLOCK FLASH ── */}
      {unlocked && !showUpgrade && (
        <div style={s.unlockFlash}>
          <span style={s.flashEmoji}>🎉</span>
          <span style={s.flashText}>შეთავაზება გახსნილია!</span>
        </div>
      )}

      {/* ── UPGRADE PHASE ── */}
      {unlocked && showUpgrade && (
        <UpgradeLayer
          itemCount={itemCount}
          threshold={threshold}
          lastFilled={lastFilled}
          exploding={exploding}
          aovMax={AOV_MAX}
        />
      )}

      {/* ── BOTTOM TRUST ── */}
      <div style={s.bottom}>
        <span style={s.cod}>🚚 გადახდა მიღებისას</span>
        <span style={s.sep}>•</span>
        <span style={s.urg}>
          <span style={s.urgDot} />
          სწრაფად იწურება
        </span>
      </div>
    </div>
  );
}

// ─── HOOK LINE ────────────────────────────────────────────────────
function HookLine({ itemCount, threshold, remaining }: { itemCount: number; threshold: number; remaining: number }) {
  const unlocked = itemCount >= threshold;
  const extra    = itemCount - threshold;

  if (unlocked && extra >= 2) return (
    <div style={s.hookRow}>
      <span style={s.hookText}>
        🔥 მეტი პროდუქტი — <b style={s.em}>მეტი სარგებელი</b>
      </span>
    </div>
  );

  if (unlocked) return (
    <div style={s.hookRow}>
      <span style={s.hookUnlocked}>✅ შეთავაზება გახსნილია — გააგრძელე!</span>
    </div>
  );

  if (remaining === 1) return (
    <div style={s.hookRow}>
      <span style={s.hookText}>
        ⚡ კიდევ <b style={s.em}>1 პროდუქტი</b> — და გახსნი შეთავაზებას!
      </span>
    </div>
  );

  return (
    <div style={s.hookRow}>
      <span style={s.hookText}>
        🔥 აირჩიე <b style={s.em}>{threshold} პროდუქტი</b> — მიიღე ფასდაკლება + ბონუსი
      </span>
    </div>
  );
}

// ─── SLOT ROW ─────────────────────────────────────────────────────
function SlotRow({ itemCount, threshold, lastFilled }: { itemCount: number; threshold: number; lastFilled: number }) {
  return (
    <div className="flex gap-[7px] mb-[9px]">
      {Array.from({ length: threshold }).map((_, i) => {
        const filled = i < itemCount;
        const active = i === itemCount;
        const isNew  = i === lastFilled;

        return (
          <div
            key={i}
            className="flex-1 rounded-[10px] pt-[9px] px-1 pb-2 flex flex-col items-center gap-[3px] transition-all duration-300 ease-in-out relative overflow-hidden"
            style={{
              ...(filled ? s.slotFilled
                : active  ? s.slotActive
                :           s.slotLocked),
              animation: isNew
                ? "slotPop .55s cubic-bezier(0.34,1.56,0.64,1)"
                : active
                ? "activePulse 2s ease-in-out infinite"
                : "none",
            }}
          >
            {filled && <div style={s.neonCorner} />}

            <span style={{
              ...s.slotNum,
              color: filled ? "#ff6a00" : active ? "#ff6a00" : "#1e1e1e",
              textShadow: filled
                ? "0 0 8px rgba(255,106,0,.9), 0 0 20px rgba(255,106,0,.5)"
                : active
                ? "0 0 6px rgba(255,106,0,.6)"
                : "none",
            }}>
              {filled ? "✓" : active ? i + 1 : "🔒"}
            </span>

            <span style={{
              ...s.slotSub,
              color: filled ? "#ff6a00"
                : active  ? "#cc4400"
                :           "#1a1a1a",
            }}>
              {filled ? "დამატდა" : active ? "შემდეგი" : `${i + 1}-ე`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────
function ProgressBar({ pct, empty }: { pct: number; empty: boolean }) {
  return (
    <div style={s.barWrap}>
      <div style={s.barTrack}>
        {empty && (
          <>
            <div style={s.barGhostGlow} />
            <div style={s.barEmptyShimmer} />
          </>
        )}

        {!empty && pct < 100 && (
          <>
            <div style={{ ...s.barFill, width: `${pct}%` }}>
              <div style={s.shimmer} />
            </div>
            <div style={{ ...s.barHead, left: `calc(${pct}% - 7px)` }} />
          </>
        )}

        {pct >= 100 && (
          <div style={s.barComplete}>
            <div style={s.shimmer} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SUB LINE ─────────────────────────────────────────────────────
function SubLine({ itemCount }: { itemCount: number }) {
  const msgs = [
    "აირჩიე პირველი პროდუქტი ↓",
    "კიდევ 2 პროდუქტი ↓",
    "კიდევ 1 — თითქმის მიაღწიე! ↓",
  ];
  return <div style={s.subLine}>{msgs[itemCount] ?? msgs[0]}</div>;
}

// ─── UPGRADE LAYER ────────────────────────────────────────────────
function UpgradeLayer({ itemCount, threshold, lastFilled, exploding, aovMax }: {
  itemCount: number; threshold: number; lastFilled: number; exploding: boolean; aovMax: number;
}) {
  return (
    <>
      <div style={s.upgradeNudge}>
        <span style={s.nudgeIcon}>➕</span>
        <span style={s.nudgeText}>
          დაამატე კიდევ — <b style={s.nudgeEm}>გაზარდე სარგებელი</b>
        </span>
      </div>

      <div className="flex gap-[7px] mb-[9px]">
        {Array.from({ length: aovMax }).map((_, i) => {
          const filled  = i < itemCount;
          const isCore  = i < threshold;
          const isNext  = i === itemCount;
          const isNew   = i === lastFilled;

          return (
            <div
              key={i}
              className="flex-1 rounded-[10px] pt-[9px] px-1 pb-2 flex flex-col items-center gap-[3px] transition-all duration-300 ease-in-out relative overflow-hidden"
              style={{
                ...(filled
                  ? isCore ? s.slotFilled : s.slotBonus
                  : isNext ? s.slotNextBonus
                  :          s.slotLockedBonus),
                transform: !isCore && !filled ? "scale(0.92)" : "scale(1)",
                animation: isNew
                  ? "slotPop .55s cubic-bezier(0.34,1.56,0.64,1)"
                  : exploding && filled && isCore
                  ? "slotGlow .6s ease-in-out infinite alternate"
                  : "none",
              }}
            >
              <span style={{
                ...s.slotNum,
                fontSize: !isCore ? 14 : 20,
                color: filled ? (isCore ? "#ff6a00" : "#ffd700")
                  : isNext ? "#cc9900" : "#1a1a1a",
                textShadow: filled && isCore
                  ? "0 0 8px rgba(255,106,0,.9), 0 0 20px rgba(255,106,0,.4)"
                  : filled && !isCore
                  ? "0 0 8px rgba(255,215,0,.8)"
                  : "none",
              }}>
                {filled ? (isCore ? "✓" : "★") : isNext ? "+" : "·"}
              </span>
              <span style={{
                ...s.slotSub,
                color: filled ? (isCore ? "#ff6a00" : "#cc9900")
                  : isNext ? "#996600" : "#1a1a1a",
              }}>
                {filled ? (isCore ? "დამატდა" : "ბონუსი!")
                  : isNext ? "დაამატე" : `+${i + 1 - threshold}`}
              </span>
            </div>
          );
        })}
      </div>

      <div style={s.socialProof}>
        💡 ხშირად ყიდულობენ 4–5 პროდუქტს ერთად
      </div>
    </>
  );
}

// ─── PARTICLES ────────────────────────────────────────────────────
const COLS = ["#ff6a00","#ff9500","#ffd700","#ff3300","#ffcc00","#fff","#ff4500"];
function makeParticles(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i,
    style: {
      "--dx": `${(Math.random() - .5) * 300}px`,
      "--dy": `${-(Math.random() * 150 + 50)}px`,
      "--rot": `${Math.random() * 720 - 360}deg`,
      background: COLS[i % COLS.length],
      width:  `${Math.random() * 8 + 5}px`,
      height: `${Math.random() * 8 + 5}px`,
      borderRadius: Math.random() > .5 ? "50%" : "2px",
      left: `${Math.random() * 80 + 10}%`,
      top: "40%",
      animationDelay: `${Math.random() * .2}s`,
      boxShadow: `0 0 6px ${COLS[i % COLS.length]}`,
    },
  }));
}

// ─── REMAINING INLINE STYLES (not yet converted) ─────────────────
const s: Record<string, React.CSSProperties> = {
  // hook
  hookRow: { textAlign: "center", marginBottom: 11 },
  hookText: {
    fontSize: 14, fontWeight: 700, color: "#e8e8e8", lineHeight: 1.4,
  },
  em: {
    color: NEON, fontWeight: 900, fontStyle: "normal",
    textShadow: "0 0 10px rgba(255,106,0,.7)",
  },
  hookUnlocked: {
    fontSize: 14, fontWeight: 900, color: "#39ff14",
    textShadow: "0 0 10px rgba(57,255,20,.6)",
  },

  // unlock flash
  unlockFlash: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 8, marginBottom: 10,
  },
  flashEmoji: { fontSize: 24 },
  flashText: {
    fontSize: 16, fontWeight: 900, color: "#39ff14",
    textShadow: "0 0 12px rgba(57,255,20,.7)",
  },

  // neon corner accent
  neonCorner: {
    position: "absolute", top: 0, left: 0, right: 0,
    height: 2,
    background: `linear-gradient(90deg, transparent, ${NEON}, transparent)`,
    opacity: 0.9,
  },

  // slot variant styles (kept inline due to complex shadows)
  slotFilled: {
    background: "#0f0800",
    border: `1.5px solid ${NEON}`,
    boxShadow: "0 0 8px rgba(255,106,0,.5), inset 0 0 12px rgba(255,106,0,.08)",
  },
  slotActive: {
    background: "#110800",
    border: `1.5px solid ${NEON}`,
    boxShadow: "0 0 0 3px rgba(255,106,0,.15), 0 0 14px rgba(255,106,0,.2)",
  },
  slotLocked: {
    background: "#0d0d0d",
    border: "1.5px dashed #1e1e1e",
    opacity: 0.55,
  },
  slotBonus: {
    background: "#0f0e00",
    border: `1.5px solid ${GOLD}`,
    boxShadow: "0 0 8px rgba(255,215,0,.4), inset 0 0 10px rgba(255,215,0,.06)",
  },
  slotNextBonus: {
    background: "#0c0b00",
    border: "1.5px solid #886600",
    boxShadow: "0 0 6px rgba(255,215,0,.15)",
  },
  slotLockedBonus: {
    background: "#0a0a00",
    border: "1.5px dashed #1a1800",
    opacity: 0.4,
  },

  slotNum: { fontSize: 20, fontWeight: 900, lineHeight: 1 },
  slotSub: {
    fontSize: 9, fontWeight: 700,
    textTransform: "uppercase", letterSpacing: ".04em", textAlign: "center",
  },

  // progress bar
  barWrap: { marginBottom: 8 },
  barTrack: {
    position: "relative", height: 8,
    background: TRACK,
    borderRadius: 99,
    overflow: "hidden",
    border: "1px solid #1e1e1e",
    boxShadow: "inset 0 1px 4px rgba(0,0,0,.6)",
  },
  barGhostGlow: {
    position: "absolute", inset: 0,
    borderRadius: 99,
    background: "transparent",
    boxShadow: "inset 0 0 0 1px rgba(255,106,0,.25)",
    animation: "ghostPulse 2s ease-in-out infinite",
  },
  barEmptyShimmer: {
    position: "absolute", top: 0,
    width: "55%", height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,106,0,.18), rgba(255,150,0,.28), rgba(255,106,0,.18), transparent)",
    animation: "emptyShimmer 2.2s ease-in-out infinite",
    borderRadius: 99,
  },
  barFill: {
    position: "absolute", left: 0, top: 0, height: "100%",
    background: `linear-gradient(90deg, #ff3300, ${NEON}, ${NEON2})`,
    borderRadius: 99,
    transition: "width .5s cubic-bezier(0.34,1.56,0.64,1)",
    boxShadow: "0 0 12px rgba(255,106,0,.7)",
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute", top: 0, left: "-60%",
    width: "50%", height: "100%",
    background: "linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent)",
    animation: "shimmerSlide 1.5s linear infinite",
    borderRadius: 99,
  },
  barHead: {
    position: "absolute", top: "50%",
    transform: "translateY(-50%)",
    width: 14, height: 14, borderRadius: "50%",
    background: NEON2,
    border: "2.5px solid #fff",
    transition: "left .5s cubic-bezier(0.34,1.56,0.64,1)",
    animation: "headPulse 1s ease-in-out infinite",
    boxShadow: "0 0 0 3px rgba(255,106,0,.3), 0 0 14px rgba(255,106,0,.8)",
  },
  barComplete: {
    position: "absolute", inset: 0,
    background: `linear-gradient(90deg,#ff3300,${NEON},${NEON2})`,
    borderRadius: 99,
    overflow: "hidden",
    animation: "barCompletePulse 1.2s ease-in-out infinite",
  },

  // sub
  subLine: {
    textAlign: "center", fontSize: 11,
    color: "#444", marginBottom: 9, fontWeight: 600,
    letterSpacing: ".01em",
  },

  // upgrade
  upgradeNudge: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 6, marginBottom: 9,
    background: "#0d0b00",
    border: "1px solid #2a2000",
    borderRadius: 10, padding: "6px 12px",
    boxShadow: "inset 0 0 12px rgba(255,215,0,.04)",
  },
  nudgeIcon: { fontSize: 13 },
  nudgeText: { fontSize: 12, color: "#997722", fontWeight: 600 },
  nudgeEm: {
    color: GOLD, fontWeight: 800, fontStyle: "normal",
    textShadow: "0 0 8px rgba(255,215,0,.6)",
  },

  socialProof: {
    textAlign: "center", fontSize: 10,
    color: "#333", marginBottom: 8, fontStyle: "italic",
  },

  // bottom
  bottom: {
    display: "flex", alignItems: "center",
    justifyContent: "center", gap: 8,
  },
  cod: { fontSize: 12, fontWeight: 700, color: "#666" },
  sep: { color: "#222", fontSize: 12 },
  urg: {
    display: "flex", alignItems: "center", gap: 5,
    fontSize: 12, fontWeight: 700, color: NEON,
    textShadow: "0 0 8px rgba(255,106,0,.5)",
  },
  urgDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: NEON,
    boxShadow: `0 0 6px ${NEON}, 0 0 12px rgba(255,106,0,.5)`,
    display: "inline-block",
    animation: "blink .9s ease-in-out infinite",
  },
};

// ─── ANIMATIONS ───────────────────────────────────────────────────
const css = `
  @keyframes slotPop {
    0%   { transform: scale(1); }
    45%  { transform: scale(1.22); }
    72%  { transform: scale(0.91); }
    100% { transform: scale(1); }
  }
  @keyframes activePulse {
    0%,100% { box-shadow: 0 0 0 3px rgba(255,106,0,.15), 0 0 12px rgba(255,106,0,.15); }
    50%      { box-shadow: 0 0 0 5px rgba(255,106,0,.06), 0 0 20px rgba(255,106,0,.28); }
  }
  @keyframes slotGlow {
    from { box-shadow: 0 0 6px rgba(255,106,0,.4),  0 0 16px rgba(255,106,0,.3); }
    to   { box-shadow: 0 0 14px rgba(255,106,0,.8), 0 0 30px rgba(255,106,0,.5); }
  }
  @keyframes ghostPulse {
    0%,100% { box-shadow: inset 0 0 0 1px rgba(255,106,0,.2); }
    50%      { box-shadow: inset 0 0 0 1px rgba(255,106,0,.5); }
  }
  @keyframes emptyShimmer {
    0%   { left: -60%; opacity: .6; }
    50%  { opacity: 1; }
    100% { left: 110%; opacity: .6; }
  }
  @keyframes shimmerSlide {
    0%   { left: -60%; }
    100% { left: 130%; }
  }
  @keyframes headPulse {
    0%,100% { box-shadow: 0 0 0 3px rgba(255,106,0,.3), 0 0 12px rgba(255,106,0,.7); }
    50%      { box-shadow: 0 0 0 6px rgba(255,106,0,.1), 0 0 22px rgba(255,106,0,1);  }
  }
  @keyframes barCompletePulse {
    0%,100% { box-shadow: 0 0 10px rgba(255,106,0,.6); }
    50%      { box-shadow: 0 0 22px rgba(255,106,0,1);  }
  }
  @keyframes blink {
    0%,100% { opacity: 1; }
    50%      { opacity: .1; }
  }
  @keyframes confettiFly {
    0%   { transform: translate(0,0) rotate(0deg); opacity: 1; }
    100% { transform: translate(var(--dx),var(--dy)) rotate(var(--rot)); opacity: 0; }
  }
`;
