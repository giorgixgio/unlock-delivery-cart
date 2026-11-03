import { useEffect, useRef, useState } from "react";
import { useDeployBusy } from "@/components/admin/NewVersionBanner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, X, Send, AlertTriangle } from "lucide-react";
import { loadOnwayCities } from "@/lib/onwayCities";
import { addChunk, chunkBody, chunkIds, emptyTotals } from "@/lib/onwayChunkSend";

interface DryRunOrder {
  order_id: string;
  order_number: string;
  tag: string;
  missing: string[];
  held?: string[];
  payload: Record<string, unknown>;
}
interface DryRun {
  count: number;
  ready_count: number;
  held_count?: number;
  skipped_already_sent: { order_id: string; order_number: string; onway_api_status: string | null }[];
  orders: DryRunOrder[];
}
interface SendResult { order_id: string; order_number: string; ok: boolean; tracking?: string | null; error?: string | null; http_status?: number | null; fulfil_error?: string | null }

async function callFn(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("onway-create-shipments", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function sendSummary(d: { sent_count?: number; review_count?: number; fulfilled_count?: number; not_fulfilled_count?: number; batch_id?: string | null }): string {
  const parts = [`${d.fulfilled_count || 0} sent & fulfilled`];
  if (d.batch_id) parts.push("batch created in Courier Labels");
  if (d.not_fulfilled_count) parts.push(`${d.not_fulfilled_count} sent but not fulfilled — fulfil manually`);
  parts.push(`${d.review_count || 0} need review`);
  return parts.join(" · ");
}

/** TrendMart-only Onway API sender. Always shows a dry-run preview before any real send. */
const OnwayApiSendModal = ({ open, onClose, orderId }: { open: boolean; onClose: () => void; orderId?: string }) => {
  const [dry, setDry] = useState<DryRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  useDeployBusy("onway-send", sending, "hard");
  const [results, setResults] = useState<SendResult[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [batchLink, setBatchLink] = useState(false);
  const busy = useRef(false);

  const load = async () => {
    setLoading(true); setErr(null);
    try { setDry(await callFn({ dry_run: true, ...(orderId ? { order_ids: [orderId] } : {}) })); } catch (e: any) { setErr(e?.message || String(e)); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) { setResults(null); setDry(null); load(); } }, [open]);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [canContinue, setCanContinue] = useState(false);

  // Block tab close/reload while a send is running.
  useEffect(() => {
    if (!sending) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sending]);
  const tryClose = () => {
    if (busy.current) { window.alert("Sending to Onway is in progress — please wait until it finishes."); return; }
    onClose();
  };

  const send = async (orderIds: string[] | null) => {
    if (busy.current || !dry) return;
    const ids = orderIds ?? (orderId ? [orderId] : dry.orders.filter((o) => !o.missing.length && !o.held?.length).map((o) => o.order_id));
    if (!ids.length) return;
    if (!window.confirm(`Really send ${ids.length} order(s) to Onway? This creates real shipments.`)) return;
    busy.current = true; setSending(true); setErr(null); setCanContinue(false); setSummary(null);
    const tags = Object.fromEntries(dry.orders.map((o) => [o.order_id, o.tag]));
    const chunks = chunkIds(ids);
    let totals = emptyTotals();
    const all: SendResult[] = [];
    setProgress({ done: 0, total: ids.length }); setResults([]);
    try {
      for (let i = 0; i < chunks.length; i++) {
        const data = await callFn(chunkBody(chunks[i], tags, totals, i === chunks.length - 1));
        totals = addChunk(totals, data, chunks[i].length);
        all.push(...(data.results || []));
        setResults([...all]);
        setProgress({ done: totals.done, total: ids.length });
      }
    } catch (e: any) {
      setErr(`Stopped after ${totals.done} / ${ids.length}: ${e?.message || String(e)}`);
      if (totals.done < ids.length) setCanContinue(true);
    } finally {
      setSummary(sendSummary(totals));
      setBatchLink(!!totals.batch_id);
      window.dispatchEvent(new Event("onway-batch-updated"));
      busy.current = false; setSending(false); setProgress(null);
      await load();
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
      <div className="bg-card rounded-lg border border-border p-6 w-full max-w-2xl mx-4 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Send to Onway (API) — TrendMart</h2>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={tryClose}><X className="w-5 h-5" /></Button>
        </div>
        {dry && orderId && dry.count === 0 && dry.skipped_already_sent.length === 0 && (
          <p className="text-sm text-destructive">This order can't be sent: it must be a confirmed, unfulfilled TrendMart order.</p>
        )}
        <p className="text-xs text-muted-foreground">Preview only until you press a send button. Orders already sent are skipped.</p>

        {err && <p className="text-sm text-destructive">{err}</p>}
        {progress && (
          <div className="space-y-1">
            <div className="text-sm font-medium flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Sending {progress.done} / {progress.total}… do not close this window</div>
            <div className="h-2 rounded bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} /></div>
          </div>
        )}
        {canContinue && !sending && dry && !orderId && (
          <Button onClick={() => send(null)} disabled={!dry.ready_count}>Continue sending the rest ({dry.ready_count})</Button>
        )}
        {summary && <div role="alertdialog" aria-label="Onway batch result" className="border border-border bg-muted p-4 flex gap-3 justify-between items-center"><div className="space-y-1"><b>{summary}</b>{batchLink && <div><a className="text-primary underline text-sm" href="/admin/courier-labels">Open Courier Labels</a></div>}</div><Button variant="ghost" size="icon" aria-label="Dismiss result" onClick={() => setSummary(null)}><X className="w-4 h-4" /></Button></div>}
        <Button variant="outline" disabled={sending || loading} onClick={async () => { setLoading(true); setErr(null); try { const {data,error}=await supabase.functions.invoke("onway-regions",{body:{}}); if(error || data?.error) throw error || new Error(data.error); await loadOnwayCities(true); await load(); } catch(e) { setErr(e instanceof Error?e.message:"City refresh failed"); } finally { setLoading(false); } }}>Refresh Onway cities</Button>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : dry && (
          <>
            <div className="bg-muted/50 rounded-lg p-3 text-sm grid grid-cols-3 gap-2">
              <div>Orders: <b>{dry.count}</b></div>
              <div>Ready: <b>{dry.ready_count}</b></div>
              <div className="text-destructive">Held: <b>{dry.held_count || 0}</b></div>
              <div>Already sent: <b>{dry.skipped_already_sent.length}</b></div>
            </div>

            {results && (
              <div className="rounded-lg border border-border p-3 space-y-1 text-sm">
                <div className="font-bold">Send results</div>
                {results.map((r) => (
                  <div key={r.order_id} className={r.ok ? "text-primary" : "text-destructive"}>
                    #{r.order_number}: {r.ok ? `sent${r.tracking ? ` — ${r.tracking}` : ""}${r.fulfil_error ? ` · ${r.fulfil_error}` : ""}` : `failed — ${r.error || `HTTP ${r.http_status}`}`}
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {dry.orders.map((o) => (
                <div key={o.order_id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Button variant="ghost" className="text-left flex-1 h-auto whitespace-normal justify-start flex-wrap" onClick={() => setExpanded(expanded === o.order_id ? null : o.order_id)}>
                      <b>#{o.order_number}</b> <span className="text-muted-foreground">[{o.tag}] {String(o.payload.to_name)} · {String(o.payload.to_city)} · {String(o.payload.order_price)} ₾</span>
                      {o.missing.length > 0 && (
                        <span className="ml-2 inline-flex items-center gap-1 text-destructive"><AlertTriangle className="w-3 h-3" /> missing: {o.missing.join(", ")}</span>
                      )}
                      {!!o.held?.length && <span className="text-destructive">Held for review: {o.held.join(", ")}</span>}
                    </Button>
                    <Button size="sm" variant="outline" disabled={sending || o.missing.length > 0 || !!o.held?.length} onClick={() => send([o.order_id])}>
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
              <Button variant="outline" onClick={tryClose} className="flex-1">Close</Button>
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
