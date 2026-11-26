import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { tbilisiDayKey } from "@/lib/tbilisiTime";

interface DailyStats {
  day: string;
  batch_count: number;
  order_count: number;
  total_with_fee: number;
  total_without_fee: number | null;
  known_net: number;
  pending_fee_orders: number;
  courier_fees: number;
}

const money = (value: number) => `${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;

export function CourierLabelDailyStats({ store, day = tbilisiDayKey(new Date()) }: { store: "A" | "B" | null; day?: string }) {
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ["courier-label-daily-stats", store, day],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("courier_label_daily_stats", { p_store: store ?? undefined, p_day: day });
      if (error) throw error;
      return data as unknown as DailyStats;
    },
    refetchInterval: 60_000,
  });

  return (
    <section aria-label="Daily upload statistics" className="border-y border-border py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Today · {day} · {store === "A" ? "BigMart" : store === "B" ? "TrendMart" : "All stores"}</h2>
        <Button variant="ghost" size="icon" aria-label="Refresh daily statistics" title="Refresh daily statistics" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">Daily totals couldn’t load. Please retry.</p> : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          {[
            ["Uploaded batches", data?.batch_count.toLocaleString() ?? "—"],
            ["Uploaded orders", data?.order_count.toLocaleString() ?? "—"],
            ["With courier fee", data ? money(data.total_with_fee) : "—"],
            ["After courier fee · net", data ? data.total_without_fee === null ? "Pending" : money(data.total_without_fee) : "—"],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-xl font-semibold tabular-nums break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {!!data?.pending_fee_orders && (
        <p className="text-xs text-muted-foreground">Known net: {money(data.known_net)} · {data.pending_fee_orders} orders awaiting courier charges</p>
      )}
    </section>
  );
}