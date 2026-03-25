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
        height: 44,
        background: "#0a0a0a",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid rgba(255,69,0,0.3)",
        boxShadow: "0 2px 12px rgba(255,69,0,0.15)",
        fontFamily: "'Noto Sans Georgian', 'FiraGO', sans-serif",
      }}
    >
      {/* Left: pulsing dot + text */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#ff4500",
            display: "inline-block",
            animation: "announceDotPulse 1s ease-in-out infinite",
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: "#cccccc",
            whiteSpace: "nowrap",
          }}
        >
          🏍️ გადახდა კურიერთან
        </span>
      </div>

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 20,
          background: "#333",
          margin: "0 12px",
          flexShrink: 0,
        }}
      />

      {/* Right: countdown timer */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 16,
            fontWeight: 800,
            color: "#ff4500",
            textShadow: "0 0 8px rgba(255,69,0,0.5)",
            letterSpacing: 1,
          }}
        >
          {mins}
        </span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: "#ff4500",
            animation: "announceDotPulse 1s ease-in-out infinite",
          }}
        >
          :
        </span>
        <span
          style={{
            fontFamily: "'Courier New', monospace",
            fontSize: 16,
            fontWeight: 800,
            color: "#ff4500",
            textShadow: "0 0 8px rgba(255,69,0,0.5)",
            letterSpacing: 1,
          }}
        >
          {secs}
        </span>
      </div>

      {/* Keyframes injected once */}
      <style>{`
        @keyframes announceDotPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
});

StickyAnnouncementBar.displayName = "StickyAnnouncementBar";
export default StickyAnnouncementBar;
