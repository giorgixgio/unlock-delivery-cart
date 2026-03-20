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
    <div className="bg-foreground/5 border border-border rounded-lg px-3 py-2 mb-3 overflow-hidden">
      <p
        className={`text-xs font-semibold text-muted-foreground text-center transition-opacity duration-300 ${
          fading ? "opacity-0" : "opacity-100"
        }`}
      >
        {message}
      </p>
    </div>
  );
});

LiveActivityTicker.displayName = "LiveActivityTicker";
export default LiveActivityTicker;
