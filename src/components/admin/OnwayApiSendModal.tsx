import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, X, Send, AlertTriangle } from "lucide-react";

interface DryRunOrder {
  order_id: string;
  order_number: string;
  tag: string;
  missing: string[];
  payload: Record<string, unknown>;
}
interface DryRun {
  count: number;
  ready_count: number;
  skipped_already_sent: { order_id: string; order_number: string; onway_api_status: string | null }[];
  orders: DryRunOrder[];
}
interface SendResult { order_id: string; order_number: string; ok: boolean; tracking?: string | null; error?: string | null; http_status?: number | null }

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("onway-create-shipments", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

/** TrendMart-only Onway API sender. Always shows a dry-run preview before any real send. */
const OnwayApiSendModal = ({ open, onClose, orderId }: { open: boolean; onClose: () => void; orderId?: string }) => {
  const [dry, setDry] = useState<DryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const busy = useRef(false);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setDry(await callFn({ dry_run: true, ...(orderId ? { order_ids: [orderId] } : {}) })); } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setResults(null); setDry(null); load(); } }, [open]);

  const send = async (orderIds: string[] | null) => {
    if (busy.current) return;
    const n = orderIds ? orderIds.length : dry?.ready_count ?? 0;
    if (!window.confirm(`Really send ${n} order(s) to Onway? This creates real shipments.`)) return;
    busy.current = true; setSending(true); setErr(null);
    try {
      const ids = orderIds ?? (orderId ? [orderId] : null);
      const data = await callFn({ dry_run: false, ...(ids ? { order_ids: ids } : {}) });
      setResults(data.results || []);
      await load();
    } catch (e: any) { setErr(e?.message || String(e)); }
    finally { busy.current = false; setSending(false); }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-2xl mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Send to Onway (API) — TrendMart</h2>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="w-5 h-5" /></button>
        </div>
        {dry && orderId && dry.count === 0 && dry.skipped_already_sent.length === 0 && (
          <p className="text-sm text-destructive">This order can't be sent: it must be a confirmed, unfulfilled TrendMart order.</p>
        )}
        <p className="text-xs text-muted-foreground">Preview only until you press a send button. Orders already sent are skipped.</p>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : dry && (
          <>
            <div className="bg-muted/50 rounded-lg p-3 text-sm grid grid-cols-3 gap-2">
              <div>Orders: <b>{dry.count}</b></div>
              <div>Ready: <b>{dry.ready_count}</b></div>
              <div>Already sent: <b>{dry.skipped_already_sent.length}</b></div>
            </div>

            {results && (
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <div className="font-bold">Send results</div>
                {results.map((r) => (
                  <div key={r.order_id} className={r.ok ? "text-primary" : "text-destructive"}>
                    #{r.order_number}: {r.ok ? `sent${r.tracking ? ` — ${r.tracking}` : ""}` : `failed — ${r.error || `HTTP ${r.http_status}`}`}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {dry.orders.map((o) => (
                <div key={o.order_id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <button className="text-left flex-1" onClick={() => setExpanded(expanded === o.order_id ? null : o.order_id)}>
                      <b>#{o.order_number}</b> <span className="text-muted-foreground">[{o.tag}] {String(o.payload.to_name)} · {String(o.payload.to_city)} · {String(o.payload.order_price)} ₾</span>
                      {o.missing.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-destructive"><AlertTriangle className="w-3 h-3" /> missing: {o.missing.join(", ")}</span>
                      )}
                    </button>
                    <Button size="sm" variant="outline" disabled={sending || o.missing.length > 0} onClick={() => send([o.order_id])}>
                      Send this one only
                    </Button>
                  </div>
                  {expanded === o.order_id && (
                    <pre className="mt-2 text-[11px] bg-muted rounded p-2 overflow-x-auto">{JSON.stringify(o.payload, null, 2)}</pre>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
              {!orderId && <Button onClick={() => send(null)} disabled={sending || !dry.ready_count} className="flex-1">
                {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Send {dry.ready_count} to Onway
              </Button>}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default OnwayApiSendModal;
