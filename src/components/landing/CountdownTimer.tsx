import { useState, useEffect, memo } from "react";
import { Clock } from "lucide-react";

interface CountdownTimerProps {
  minutes?: number;
}

const CountdownTimer = memo(({ minutes = 19 }: CountdownTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const stored = sessionStorage.getItem("landing_countdown_end");
    if (stored) {
      const remaining = Math.max(0, Math.floor((Number(stored) - Date.now()) / 1000));
      return remaining > 0 ? remaining : minutes * 60;
    }
    const end = Date.now() + minutes * 60 * 1000;
    sessionStorage.setItem("landing_countdown_end", String(end));
    return minutes * 60;
  });

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [secondsLeft]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const urgency = secondsLeft < 120;

  return (
    <div className={`flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border transition-colors ${
      urgency
        ? "bg-destructive/10 border-destructive/30"
        : "bg-primary/5 border-primary/20"
    }`}>
      <Clock className={`w-4 h-4 ${urgency ? "text-destructive animate-pulse" : "text-primary"}`} />
      <span className={`text-xs font-bold ${urgency ? "text-destructive" : "text-muted-foreground"}`}>
        ფასდაკლება მოქმედებს:
      </span>
      <div className="flex items-center gap-1">
        <span className={`font-mono text-lg font-extrabold tabular-nums ${
          urgency ? "text-destructive" : "text-primary"
        }`}>
          {String(mins).padStart(2, "0")}
        </span>
        <span className={`text-lg font-extrabold ${urgency ? "text-destructive animate-pulse" : "text-primary"}`}>:</span>
        <span className={`font-mono text-lg font-extrabold tabular-nums ${
          urgency ? "text-destructive" : "text-primary"
        }`}>
          {String(secs).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
});

CountdownTimer.displayName = "CountdownTimer";
export default CountdownTimer;
