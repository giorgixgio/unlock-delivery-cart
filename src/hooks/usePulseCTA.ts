import { useState, useEffect } from "react";

/**
 * Subtle pulse animation for primary CTAs.
 * Triggers after 3-5s of inactivity, 20-40s cooldown.
 * Disabled while scrolling, tapping, typing, or if prefers-reduced-motion.
 */
export function usePulseCTA(enabled: boolean): boolean {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!enabled) { setPulse(false); return; }
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let timeout: number;
    let cooldownTimeout: number;
    let active = true;

    const triggerPulse = () => {
      if (!active) return;
      setPulse(true);
      setTimeout(() => { if (active) setPulse(false); }, 1200);
      cooldownTimeout = window.setTimeout(schedulePulse, 20000 + Math.random() * 20000);
    };

    const schedulePulse = () => {
      timeout = window.setTimeout(triggerPulse, 3000 + Math.random() * 2000);
    };

    const resetTimer = () => {
      setPulse(false);
      clearTimeout(timeout);
      clearTimeout(cooldownTimeout);
      schedulePulse();
    };

    const events = ["scroll", "touchstart", "mousedown", "keydown"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    schedulePulse();

    return () => {
      active = false;
      clearTimeout(timeout);
      clearTimeout(cooldownTimeout);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [enabled]);

  return pulse;
}
