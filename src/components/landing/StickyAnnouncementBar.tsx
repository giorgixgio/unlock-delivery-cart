import { useState, useEffect, memo } from "react";

const StickyAnnouncementBar = memo(() => {
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
