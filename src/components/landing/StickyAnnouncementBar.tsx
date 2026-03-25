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
        height: 46,
        background: "linear-gradient(90deg, #ff6a00, #ffb300, #ff6a00)",
        backgroundSize: "200% 100%",
        animation: "announceGradient 3s ease infinite, barFlash 0.6s ease-in-out infinite",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "2px solid rgba(0,0,0,0.15)",
        boxShadow: "0 3px 16px rgba(255,106,0,0.5)",
        fontFamily: "'Noto Sans Georgian', 'FiraGO', sans-serif",
      }}
    >
      {/* Left: lightning + text */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#fff",
          whiteSpace: "nowrap",
        }}
      >
        ⚡ ფლეშ ფასი მოქმედებს მხოლოდ:
      </span>

      {/* Right: timer + hourglass */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 20,
            fontWeight: 900,
            color: "#fff",
            letterSpacing: 2,
            textShadow: "0 0 10px rgba(255,255,255,0.8)",
          }}
        >
          {mins}:{secs}
        </span>
        <span style={{ fontSize: 14, color: "#fff" }}>⏳</span>
      </div>

      <style>{`
        @keyframes announceGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes barFlash {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.85; }
        }
      `}</style>
    </div>
  );
});

StickyAnnouncementBar.displayName = "StickyAnnouncementBar";
export default StickyAnnouncementBar;
