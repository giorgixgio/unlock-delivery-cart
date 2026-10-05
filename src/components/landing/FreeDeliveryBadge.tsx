import { useState, useEffect, memo } from "react";
import { Truck } from "lucide-react";

/** Free-delivery badge with a live countdown to midnight Tbilisi time (UTC+4,
 *  no DST). Resets daily. Used on free-shipping landing pages (e.g. 0016). */

const TBILISI_OFFSET_MS = 4 * 3600 * 1000;

function msUntilTbilisiMidnight(): number {
  const now = Date.now();
  const tbilisiNow = now + TBILISI_OFFSET_MS;
  const nextMidnightTbilisi = Math.floor(tbilisiNow / 86400000) * 86400000 + 86400000;
  return nextMidnightTbilisi - tbilisiNow;
}

const pad = (n: number) => String(n).padStart(2, "0");

const FreeDeliveryBadge = memo(() => {
  const [msLeft, setMsLeft] = useState(msUntilTbilisiMidnight);

  useEffect(() => {
    const interval = setInterval(() => setMsLeft(msUntilTbilisiMidnight()), 1000);
    return () => clearInterval(interval);
  }, []);

  const totalSec = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 shadow-sm px-3.5 py-2.5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <Truck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 motion-safe:animate-pulse" />
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 leading-tight">
            უფასო მიტანა
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 leading-tight">
            შეთავაზება სრულდება:
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0" aria-live="off">
        {[pad(h), pad(m), pad(s)].map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">:</span>
            )}
            <span className="font-mono tabular-nums text-sm font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/25 rounded-md px-1.5 py-0.5">
              {seg}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
});

FreeDeliveryBadge.displayName = "FreeDeliveryBadge";
export default FreeDeliveryBadge;
