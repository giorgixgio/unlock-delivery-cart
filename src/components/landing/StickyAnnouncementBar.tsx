import { useState, useEffect, memo } from "react";

const StickyAnnouncementBar = memo(({ variant }: { variant?: "camera" }) => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const stored = sessionStorage.getItem("announcement_countdown_end");
    if (stored) {
      const remaining = Math.max(0, Math.floor((Number(stored) - Date.now()) / 1000));
      if (remaining > 0) return remaining;
    }
    const end = Date.now() + 3600 * 1000;
    sessionStorage.setItem("announcement_countdown_end", String(end));
    return 3600;
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          const end = Date.now() + 3600 * 1000;
          sessionStorage.setItem("announcement_countdown_end", String(end));
          return 3600;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const mins = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const secs = String(secondsLeft % 60).padStart(2, "0");

  if (variant === "camera") {
    const parts = [
      [String(Math.floor(secondsLeft / 3600)).padStart(2, "0"), "საათი"],
      [String(Math.floor((secondsLeft % 3600) / 60)).padStart(2, "0"), "წუთი"],
      [secs, "წამი"],
    ];
    return (
      <div className="cam-announce sticky top-0 z-[60] w-full">
        <div className="max-w-lg mx-auto px-4 py-2 flex items-center justify-between gap-3">
          <span className="cam-announce-badge rounded-full px-3 py-1 text-xs font-extrabold whitespace-nowrap">⚡ ფლეშ ფასი</span>
          <div className="cam-clock rounded-xl px-2.5 py-1 flex items-start gap-1.5 font-mono">
            {parts.map(([v, l], i) => (
              <div key={l} className="flex items-start gap-1.5">
                {i > 0 && <span className="text-base font-bold leading-5 opacity-70">:</span>}
                <div className="text-center leading-none">
                  <div className="text-base font-extrabold tabular-nums leading-5">{v}</div>
                  <div className="text-[8px] font-sans opacity-75">{l}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 60,
        width: "100%",
        height: 28,
        background: "rgba(255, 106, 0, 0.92)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        fontFamily: "'Noto Sans Georgian', 'FiraGO', sans-serif",
      }}
    >
      {/* Left: lightning + text */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#fff",
          whiteSpace: "nowrap",
          opacity: 0.95,
        }}
      >
        ⚡ ფლეშ ფასი:
      </span>

      {/* Right: timer */}
      <span
        style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 13,
          fontWeight: 700,
          color: "#fff",
          letterSpacing: 1,
        }}
      >
        {mins}:{secs}
      </span>
    </div>
  );
});

StickyAnnouncementBar.displayName = "StickyAnnouncementBar";
export default StickyAnnouncementBar;
