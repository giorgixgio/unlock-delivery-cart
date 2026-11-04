import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Loader2, XCircle, ChevronDown, ExternalLink, AlertTriangle, GitMerge } from "lucide-react";
import ManualMergeModal from "@/components/admin/ManualMergeModal";
import { cancelOrderWithReason } from "@/lib/callAttemptService";
import { currentSessionId } from "@/lib/operatorSession";
import { summarizePreviousOrders } from "@/lib/previousOrdersSummary";
import { type HistOrder, type Stage, STAGE_LABEL, REASON_LABEL, historyBadge, historyCounts, reasonOf, stageOf } from "@/lib/customerHistory";

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  packed: "bg-amber-100 text-amber-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  on_hold: "bg-orange-100 text-orange-800",
  merged: "bg-slate-100 text-slate-500",
  pending_bump: "bg-yellow-100 text-yellow-800",
};

const NON_CANCELLABLE = ["canceled", "delivered", "shipped", "packed", "returned", "merged"];

type PrevOrder = HistOrder;

const STAGE_CLS: Partial<Record<Stage, string>> = {
  delivered: "bg-green-100 text-green-800",
  final_failed: "bg-red-100 text-red-800",
  returned: "bg-red-100 text-red-800",
  failed_attempt: "bg-orange-100 text-orange-800",
  pickup_cancelled: "bg-gray-100 text-gray-700",
};

const BADGE_CLS: Record<string, string> = {
  refused: "bg-red-100 text-red-800 border-red-300",
  on_the_way: "bg-orange-100 text-orange-800 border-orange-300",
  failed_not_refusal: "bg-muted text-foreground border-border",
  delivered: "bg-green-100 text-green-800 border-green-300",
};

interface Props {
  order: { id: string; customer_phone: string; is_fulfilled?: boolean | null };
  currentSkus: string[];
  actor: string;
  /** Queue: collapsed accordion with one-line summary. Pop-up: always open (original layout). */
  accordion?: boolean;
}

export default function PreviousOrdersPanel({ order, currentSkus, actor, accordion = false }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prevOrders, setPrevOrders] = useState<PrevOrder[]>([]);
  const [prevLoading, setPrevLoading] = useState(false);
  const [bulkCanceling, setBulkCanceling] = useState(false);
  const [expandedPrevId, setExpandedPrevId] = useState<string | null>(null);
  const [prevItemsById, setPrevItemsById] = useState<Record<string, { sku: string; title: string; quantity: number; unit_price: number; image_url: string }[]>>({});
  const [prevItemsLoading, setPrevItemsLoading] = useState<string | null>(null);
  const [cancelingPrevId, setCancelingPrevId] = useState<string | null>(null);
  const [mergeWithPrevId, setMergeWithPrevId] = useState<string | null>(null);
  const [open, setOpen] = useState(!accordion);

  useEffect(() => {
    setExpandedPrevId(null);
    setOpen(!accordion);
    if (!order.customer_phone || !order.id) { setPrevOrders([]); return; }
    const last9 = order.customer_phone.replace(/\D/g, "").slice(-9);
    if (last9.length < 6) { setPrevOrders([]); return; }
    let cancelled = false;
    setPrevLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc("operator_customer_history" as any, { p_order_id: order.id });
      if (cancelled) return;
      if (error) console.warn("customer history failed", error.message);
      setPrevOrders(((data as unknown) || []) as PrevOrder[]);
      setPrevLoading(false);
    })();
    return () => { cancelled = true; };
  }, [order.id, order.customer_phone, accordion]);

  const cancellablePrev = useMemo(() => prevOrders.filter((p) => !NON_CANCELLABLE.includes(p.status)), [prevOrders]);
  const summary = useMemo(() => summarizePreviousOrders(prevOrders, currentSkus, new Date()), [prevOrders, currentSkus]);

  const handleBulkCancelPrev = useCallback(async () => {
    if (cancellablePrev.length === 0) return;
    if (!confirm(`${cancellablePrev.length} წინა შეკვეთა გაუქმდება (დუბლიკატი). გავაგრძელო?`)) return;
    setBulkCanceling(true);
    let ok = 0, fail = 0;
    for (const p of cancellablePrev) {
      const success = await cancelOrderWithReason(
        p.id, actor, "duplicate_order", "Bulk-canceled as duplicate from quick review",
        Number(p.call_attempt_count || 0), undefined, "duplicate_cleanup", currentSessionId(),
      );
      if (success) ok++; else fail++;
    }
    setPrevOrders((list) => list.map((p) => cancellablePrev.some((c) => c.id === p.id) ? { ...p, status: "canceled" } : p));
    setBulkCanceling(false);
    toast({
      title: fail === 0 ? `გაუქმდა ${ok} წინა შეკვეთა` : `გაუქმდა ${ok}, ვერ ${fail}`,
      variant: fail === 0 ? undefined : "destructive",
    });
  }, [cancellablePrev, actor, toast]);

  const togglePrevExpand = useCallback(async (id: string) => {
    if (expandedPrevId === id) { setExpandedPrevId(null); return; }
    setExpandedPrevId(id);
    if (!prevItemsById[id]) {
      setPrevItemsLoading(id);
      const { data } = await supabase.from("order_items").select("sku, title, quantity, unit_price, image_url").eq("order_id", id);
      setPrevItemsById((m) => ({ ...m, [id]: (data || []) as any }));
      setPrevItemsLoading(null);
    }
  }, [expandedPrevId, prevItemsById]);

  const cancelSinglePrev = useCallback(async (p: PrevOrder) => {
    if (!confirm(`შეკვეთა #${p.public_order_number} გაუქმდება (დუბლიკატი). გავაგრძელო?`)) return;
    setCancelingPrevId(p.id);
    const ok = await cancelOrderWithReason(
      p.id, actor, "duplicate_order", "Canceled as duplicate from quick review",
      Number(p.call_attempt_count || 0), undefined, "duplicate_cleanup", currentSessionId(),
    );
    setCancelingPrevId(null);
    if (ok) {
      setPrevOrders((list) => list.map((x) => x.id === p.id ? { ...x, status: "canceled" } : x));
      toast({ title: `#${p.public_order_number} გაუქმდა` });
    } else {
      toast({ title: "გაუქმება ვერ მოხერხდა", variant: "destructive" });
    }
  }, [actor, toast]);

  if (!prevLoading && prevOrders.length === 0) return null;

  const tone = summary.level === "red"
    ? "border-red-400 bg-red-50/60 dark:bg-red-950/10"
    : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/10";
  const sectionCls = accordion ? `rounded-lg border p-3 ${tone}` : "rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-950/10 p-3";
  const titleCls = summary.level === "red" && accordion ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300";

  return (
    <section className={sectionCls}>
      <div className={`flex items-center justify-between gap-2 flex-wrap ${open ? "mb-2" : ""}`}>
        {accordion ? (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            className={`flex items-center gap-1.5 min-w-0 flex-1 text-left ${titleCls}`}>
            <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform ${open ? "rotate-0" : "-rotate-90"}`} />
            <span className="text-xs font-bold uppercase tracking-wider">წინა შეკვეთები</span>
            <span className={`text-xs ${summary.level === "none" ? "text-muted-foreground" : "font-bold"} truncate`}>
              {prevLoading ? "იტვირთება…" : summary.line}
            </span>
          </button>
        ) : (
          <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            წინა შეკვეთები ({prevOrders.length})
          </h3>
        )}
        {open && cancellablePrev.length > 0 && (
          <Button size="sm" variant="destructive" className="h-7 gap-1.5 text-xs" disabled={bulkCanceling} onClick={handleBulkCancelPrev}>
            {bulkCanceling ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
            ყველა წინა გააუქმე ({cancellablePrev.length})
          </Button>
        )}
      </div>
      {open && (prevLoading ? (
        <div className="text-xs text-muted-foreground">იტვირთება…</div>
      ) : (
        <div className="space-y-1">
          {prevOrders.map((p) => {
            const isExpanded = expandedPrevId === p.id;
            const items = prevItemsById[p.id];
            const canCancelRow = !NON_CANCELLABLE.includes(p.status);
            const canMergeRow = canCancelRow && !order.is_fulfilled;
            const titles = (p.order_items || []).map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ");
            return (
              <div key={p.id} className="bg-background/70 rounded-md border border-border/60 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <button type="button" onClick={() => togglePrevExpand(p.id)}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80" aria-expanded={isExpanded}>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-0" : "-rotate-90"}`} />
                    <span className="font-mono text-xs font-bold">#{p.public_order_number}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${statusColor[p.status] || "bg-muted"}`}>
                      {p.status.replace("_", " ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {new Date(p.created_at).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-xs font-semibold mr-1">{Number(p.total).toFixed(2)} ₾</span>
                    {canMergeRow && (
                      <button type="button" onClick={() => setMergeWithPrevId(p.id)} className="p-1 rounded hover:bg-blue-100 text-blue-700"
                        title="მიმდინარესთან შერწყმა" aria-label="Merge with current">
                        <GitMerge className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canCancelRow && (
                      <button type="button" disabled={cancelingPrevId === p.id} onClick={() => cancelSinglePrev(p)}
                        className="p-1 rounded hover:bg-red-100 text-red-700 disabled:opacity-50" title="გააუქმე (დუბლიკატი)" aria-label="Cancel this order">
                        {cancelingPrevId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <button type="button" onClick={() => navigate(`/admin/orders/${p.id}`)} className="p-1 rounded hover:bg-muted text-primary"
                      title="Advanced" aria-label="Open advanced">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {titles && !isExpanded && (
                  <div className="px-2.5 pb-1.5 -mt-0.5 pl-8 text-[11px] text-muted-foreground truncate">{titles}</div>
                )}
                {isExpanded && (
                  <div className="border-t border-border/60 bg-muted/30 px-2.5 py-1.5">
                    {prevItemsLoading === p.id ? (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> იტვირთება…</div>
                    ) : items && items.length > 0 ? (
                      <ul className="space-y-1">
                        {items.map((it, idx) => (
                          <li key={idx} className="flex items-center gap-2 text-[11px]">
                            {it.image_url && <img src={it.image_url} alt="" className="w-6 h-6 rounded object-cover border border-border/60" />}
                            <span className="flex-1 truncate">{it.title}</span>
                            <span className="font-semibold">×{it.quantity}</span>
                            <span className="text-muted-foreground w-14 text-right">{(it.unit_price * it.quantity).toFixed(2)} ₾</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-[11px] text-muted-foreground">პროდუქტები არ არის</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
      {mergeWithPrevId && (
        <ManualMergeModal
          open={!!mergeWithPrevId}
          orderIds={[order.id, mergeWithPrevId]}
          onClose={() => setMergeWithPrevId(null)}
          onComplete={() => {
            const id = mergeWithPrevId;
            setMergeWithPrevId(null);
            setPrevOrders((list) => list.map((x) => x.id === id ? { ...x, status: "merged" } : x));
            toast({ title: "შერწყმა დასრულდა ✓" });
          }}
        />
      )}
    </section>
  );
}
