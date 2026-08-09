import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Flame, ShoppingCart } from "lucide-react";

const STORAGE_PREFIX = "offer1p1:";

/**
 * Evergreen countdown: stores a start timestamp per slug in localStorage.
 * When the countdown hits zero it silently restarts from the full duration,
 * so the timer never sits at 0:00 or shows "expired".
 */
export function useEvergreenCountdown(slug: string, minutes: number) {
  const durationMs = Math.max(1, minutes) * 60 * 1000;
  const key = STORAGE_PREFIX + slug;

  const readStart = () => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? Number(raw) : NaN;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        const now = Date.now();
        localStorage.setItem(key, String(now));
        return now;
      }
      return parsed;
    } catch {
      return Date.now();
    }
  };

  const [remaining, setRemaining] = useState(() => {
    const start = readStart();
    const elapsed = (Date.now() - start) % durationMs;
    return durationMs - elapsed;
  });

  useEffect(() => {
    const tick = () => {
      const start = readStart();
      const elapsed = Date.now() - start;
      if (elapsed >= durationMs) {
        // Loop back to a fresh countdown
        const now = Date.now();
        try {
          localStorage.setItem(key, String(now));
        } catch {
          /* ignore */
        }
        setRemaining(durationMs);
        return;
      }
      setRemaining(durationMs - elapsed);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, durationMs]);

  const totalSeconds = Math.max(0, Math.ceil(remaining / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = totalSeconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

interface OnePlusOneOfferProps {
  slug: string;
  unitPrice: number;
  timerMinutes: number;
  onOrder: () => void;
}

const OnePlusOneOffer = ({ slug, unitPrice, timerMinutes, onOrder }: OnePlusOneOfferProps) => {
  const clock = useEvergreenCountdown(slug, timerMinutes);
  const price = unitPrice.toFixed(0);

  return (
    <div className="rounded-xl border-2 border-destructive bg-destructive/10 p-3 shadow-lg">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-extrabold text-destructive">
          <Flame className="h-4 w-4" />
          1+1 შეთავაზება
        </span>
        <span className="rounded-md bg-destructive px-2 py-0.5 font-mono text-sm font-extrabold tabular-nums text-destructive-foreground">
          {clock}
        </span>
      </div>

      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground line-through">{price}₾ x2</span>
        <span className="text-lg font-extrabold text-destructive">{price}₾ ორივესთვის</span>
      </div>

      <Button
        onClick={onOrder}
        size="lg"
        className="mt-2.5 h-12 w-full rounded-xl bg-destructive text-base font-bold text-destructive-foreground hover:bg-destructive/90"
      >
        <ShoppingCart className="mr-2 h-5 w-5" />
        შეუკვეთე 2 ცალი ერთი ფასად
      </Button>
    </div>
  );
};

export default OnePlusOneOffer;
