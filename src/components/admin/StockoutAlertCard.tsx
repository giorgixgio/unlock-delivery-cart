import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, PackageX } from "lucide-react";
import { fetchStockoutAttempts, aggregateByProduct, isStockoutAlert } from "@/lib/stockoutService";

/** Compact alert tile for the main admin dashboard. Hidden when no alerts. */
const StockoutAlertCard = () => {
  const [alertCount, setAlertCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await fetchStockoutAttempts(1);
        if (cancelled) return;
        const aggs = aggregateByProduct(rows);
        setAlertCount(aggs.filter(isStockoutAlert).length);
      } catch {
        if (!cancelled) setAlertCount(0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!alertCount) return null;

  return (
    <Link
      to="/admin/stockout-demand?filter=alerts"
      className="block"
    >
      <Card className="ring-2 ring-amber-400/60 bg-amber-50/40 dark:bg-amber-950/10 hover:shadow-md transition-shadow">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <PackageX className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Stockout Demand Alerts</p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {alertCount} sold-out SKU{alertCount === 1 ? "" : "s"} still receiving order attempts
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Check active Meta ads or restock.</p>
          </div>
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
};

export default StockoutAlertCard;
