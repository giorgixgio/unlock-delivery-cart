import { useState, useEffect, memo } from "react";
import { getTickerMessage } from "@/lib/socialProofEngine";

/**
 * A subtle live-activity ticker bar for the homepage.
 * Rotates messages every 5-7s with fade transition.
 */
const LiveActivityTicker = memo(() => {
  const [message, setMessage] = useState(() => getTickerMessage());
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setFading(true);
      setTimeout(() => {
        setMessage(getTickerMessage());
        setFading(false);
      }, 300);
    }, 5500 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex justify-center" aria-live="polite">
      <div className="inline-flex items-center gap-2 bg-card/90 backdrop-blur border border-border/60 shadow-soft rounded-full pl-2 pr-4 py-1.5 max-w-full">
        <span className="relative flex w-2.5 h-2.5 flex-shrink-0">
          <span className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping" />
          <span className="relative w-2.5 h-2.5 rounded-full bg-success" />
        </span>
        <p className={`text-xs font-semibold text-foreground truncate transition-all duration-300 ${fading ? "opacity-0 -translate-y-1" : "opacity-100 translate-y-0"}`}>
          {message}
        </p>
      </div>
    </div>
  );
});

LiveActivityTicker.displayName = "LiveActivityTicker";
export default LiveActivityTicker;
