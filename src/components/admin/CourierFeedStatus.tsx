import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

type FeedStatus = { last_webhook_at: string | null; unmapped: string[]; api_shipments: number; api_open: number } | null;

const fmt = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "—";

/** Live Onway feed header: last webhook time, API shipment count, unmapped statuses, manual refresh. */
export function CourierFeedStatus({ showBackfill = false }: { showBackfill?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data, isFetching } = useQuery<FeedStatus>({
    queryKey: ["courier-feed-status"],
    staleTime: 60_000,
    refetchInterval: 90_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("courier_feed_status");
      if (error) throw error;
      return data as FeedStatus;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["courier-dataset"] });
    qc.invalidateQueries({ queryKey: ["courier-feed-status"] });
    qc.invalidateQueries({ queryKey: ["courier-alert-badge"] });
  };

  const backfill = async () => {
    setBusy(true);
    const { data: r, error } = await supabase.functions.invoke("onway-status-pull", { body: { action: "backfill" } });
    setBusy(false);
    if (error) { toast({ title: "Backfill failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Backfill done", description: `${r?.trackings ?? 0} shipments · ${r?.history_added ?? 0} history rows added` });
    refresh();
  };

  const unmapped = data?.unmapped ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">Onway API live</Badge>
        <span className="text-muted-foreground">Last webhook: <b className="text-foreground">{fmt(data?.last_webhook_at ?? null)}</b></span>
        <span className="text-muted-foreground">· API shipments: {data?.api_shipments ?? 0} ({data?.api_open ?? 0} open)</span>
        <Button size="sm" variant="outline" onClick={refresh} disabled={isFetching} className="ml-auto">
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Refresh
        </Button>
        {showBackfill && (
          <Button size="sm" variant="outline" onClick={backfill} disabled={busy}>
            {busy ? "Rebuilding…" : "Rebuild API shipments from webhooks"}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Status pull not enabled — waiting for Onway endpoint. Live updates come from the Onway webhook; silence over 3h (Mon–Sat 10:00–20:00) alerts Telegram.</p>
      {unmapped.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span>Unmapped courier status{unmapped.length > 1 ? "es" : ""}: <b>{unmapped.join(", ")}</b> — counted as “in progress” until classified.</span>
          <Link to="/admin/courier/statuses" className="ml-auto underline">Classify</Link>
        </div>
      )}
    </div>
  );
}
