import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Activity, Loader2 } from "lucide-react";
import { OUTCOME_LABEL } from "@/components/admin/OrderQuickReviewModal";

interface Evt {
  id: string;
  created_at: string;
  actor: string;
  event_type: string;
  payload: any;
}

interface Props {
  orderId: string;
  /** When this changes, refetch (e.g., after each save) */
  refreshKey?: number;
}

function describe(e: Evt): string {
  const a = e.actor || "system";
  switch (e.event_type) {
    case "order_opened":
      return `${a} opened order`;
    case "operator_quick_status": {
      const label = OUTCOME_LABEL[e.payload?.label] || e.payload?.label || "—";
      return `${a} set outcome → ${label}`;
    }
    case "manual_edit":
      return `${a} saved edits${e.payload?.changed?.length ? ` (${e.payload.changed.join(", ")})` : ""}`;
    case "item_added":
      return `${a} added ${e.payload?.title || e.payload?.sku || "item"}${e.payload?.added_revenue ? ` (+${Number(e.payload.added_revenue).toFixed(1)} ₾)` : ""}`;
    case "item_quantity_change":
      return `${a} changed ${e.payload?.sku || "item"} qty ${e.payload?.from} → ${e.payload?.to}`;
    case "item_removed":
      return `${a} removed ${e.payload?.title || e.payload?.sku || "item"}`;
    case "status_change":
      return `${a}: status ${e.payload?.from || "?"} → ${e.payload?.to || "?"}`;
    default:
      return `${a}: ${e.event_type}`;
  }
}

export default function OrderActivityLog({ orderId, refreshKey }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Evt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("order_events")
        .select("id, created_at, actor, event_type, payload")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (cancelled) return;
      setEvents((data as Evt[]) || []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orderId, open, refreshKey]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card">
      <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground">
        <span className="flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> Activity</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="py-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> იტვირთება…
          </div>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2 text-center">No activity yet</p>
        ) : (
          <ol className="space-y-1.5 text-xs">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2 border-b border-border/40 pb-1.5 last:border-0">
                <span className="truncate">{describe(e)}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {new Date(e.created_at).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
