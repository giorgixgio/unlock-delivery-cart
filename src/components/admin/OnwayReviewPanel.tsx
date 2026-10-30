import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OnwayCityPicker from "@/components/OnwayCityPicker";
import { useOnwayCities } from "@/hooks/useOnwayCities";
import { selectedCityValid, loadOnwayCities } from "@/lib/onwayCities";
import { LockKeyhole, Loader2, RefreshCw } from "lucide-react";

export interface OnwayReviewRow { order_id: string; order_number: string; version: number; customer_name: string; customer_phone: string; city: string; address: string; region_id: string | null; state: "held" | "rejected" | "unclear"; error: string | null; reasons: string[] }
const labels = { held: "Held for review — never sent", rejected: "Rejected by Onway", unclear: "Unclear — may exist in Onway" };
async function invoke(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("onway-create-shipments", { body });
  if (error) throw error; if (data?.error) throw new Error(data.error); return data;
}
export function useOnwayReview(enabled: boolean) {
  const [rows, setRows] = useState<OnwayReviewRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (!enabled) { setRows(old => old.length ? [] : old); return; }
    try { const data = await invoke({ action: "review_list", dry_run: true }); const next = data.orders || []; setRows(old => JSON.stringify(old) === JSON.stringify(next) ? old : next); setError(null); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Onway review"); }
  }, [enabled]);
  useEffect(() => { void refresh(); const timer = setInterval(refresh, 30000); window.addEventListener("onway-batch-updated",refresh); return () => { clearInterval(timer); window.removeEventListener("onway-batch-updated",refresh); }; }, [refresh]);
  return { rows, refresh, error };
}
export default function OnwayReviewPanel({ rows, onUpdated }: { rows: OnwayReviewRow[]; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [edits, setEdits] = useState<OnwayReviewRow[]>([]);
  const [tracking, setTracking] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const { cities, loading } = useOnwayCities();
  const patch = (id: string, values: Partial<OnwayReviewRow>) => setEdits(old => old.map(r => r.order_id === id ? { ...r, ...values } : r));
  const save = (r: OnwayReviewRow, decision: "confirm" | "exists" | "not_exists") => invoke({ action: "review_save", review: { order_id: r.order_id, version: r.version, region_id: r.region_id || "", address: r.address, name: r.customer_name, phone: r.customer_phone.replace(/[\s()-]/g, ""), decision, tracking: tracking[r.order_id] || "" } });
  const run = async (items: OnwayReviewRow[], decision: "confirm" | "exists" | "not_exists") => {
    if (busy) return;
    if (decision !== "exists" && items.some(r => !selectedCityValid(cities, r.region_id, r.city) || !r.address.trim() || !r.customer_name.trim())) { setError("Select a city and complete name, phone and address for each order."); return; }
    if (decision === "exists" && !tracking[items[0]?.order_id]?.trim()) { setError("Enter the tracking number from Onway."); return; }
    const prompt = decision === "exists" ? "Confirm you verified this shipment exists in Onway and the tracking is correct?" : decision === "not_exists" ? "Confirm you checked Onway and this shipment DOES NOT exist? Resending creates a real shipment." : `Confirm & send ${items.length} corrected orders? This creates real Onway shipments.`;
    if (!window.confirm(prompt)) return;
    setBusy(true); setError(null); setResult(null);
    const saved: string[] = [];
    try {
      for (const row of items) { await save(row, decision); saved.push(row.order_id); }
      if (decision !== "exists") {
        const reply = await invoke({ dry_run: false, order_ids: saved });
        setResult(`${reply.sent_count || 0} sent, ${reply.review_count || 0} need review`);
      } else setResult("Tracking recorded — duplicate lock retained.");
      onUpdated(); setEdits(old => old.filter(r => !saved.includes(r.order_id)));
    } catch (e) { setError(`${e instanceof Error ? e.message : "Review failed"}${saved.length ? ` (${saved.length} corrections saved; refresh before retrying)` : ""}`); onUpdated(); }
    finally { setBusy(false); }
  };
  const refreshCities = async () => {
    if (busy) return; setBusy(true); setError(null);
    try { const { data, error } = await supabase.functions.invoke("onway-regions", { body: {} }); if (error || data?.error) throw error || new Error(data.error); await loadOnwayCities(true); setResult(`${data.count} Onway destinations refreshed. Reopen review to load the new list.`); }
    catch(e) { setError(e instanceof Error ? e.message : "Refresh failed"); } finally { setBusy(false); }
  };
  if (!rows.length && !open) return null;
  return <>
    <section className="border-l-4 border-destructive bg-destructive/10 px-4 py-4 space-y-3" aria-label="Onway needs review">
      <div className="flex flex-wrap justify-between gap-3 items-center"><h2 className="font-bold text-lg">Needs review <span className="text-destructive">{rows.length}</span></h2><Button onClick={() => { setEdits(rows.map(r => ({ ...r }))); setOpen(true); setError(null); setResult(null); }}>Review</Button></div>
      <ul className="space-y-2">{rows.map(r => <li key={r.order_id} className="flex gap-2 items-start text-sm"><LockKeyhole className="w-4 h-4 mt-0.5 shrink-0" /><div><b>#{r.order_number}</b> · {labels[r.state]}{r.error && <p className="text-destructive break-words">{r.error}</p>}</div></li>)}</ul>
    </section>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}><DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Onway — Needs review ({edits.length})</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={refreshCities}><RefreshCw className="w-4 h-4 mr-2" />Refresh Onway cities</Button><Button disabled={busy || loading || !edits.some(r => r.state !== "unclear")} onClick={() => run(edits.filter(r => r.state !== "unclear"), "confirm")}>{busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Confirm & send fixed orders</Button></div>
      {error && <p role="alert" className="text-destructive text-sm break-words">{error}</p>}{result && <p role="status" className="font-bold">{result}</p>}
      <div className="divide-y divide-border">{edits.map(r => <section key={r.order_id} className="py-4 space-y-3">
        <div className="flex gap-2 items-center"><LockKeyhole className="w-4 h-4" /><b>#{r.order_number}</b><span className="text-sm">{labels[r.state]}</span></div>
        {(r.error || r.reasons.length > 0) && <p className="text-sm text-destructive break-words">{r.error || r.reasons.join(", ")}</p>}
        <div className="grid sm:grid-cols-2 gap-3"><div><Label>Name</Label><Input aria-label={`Name ${r.order_number}`} value={r.customer_name} onChange={e => patch(r.order_id, { customer_name: e.target.value })} /></div><div><Label>Phone</Label><Input aria-label={`Phone ${r.order_number}`} value={r.customer_phone} onChange={e => patch(r.order_id, { customer_phone: e.target.value })} /></div><div><Label>City</Label><OnwayCityPicker value={r.city} cities={cities} loading={loading} onChange={city => patch(r.order_id, { city, region_id: null })} onSelect={c => patch(r.order_id, { city: c.name, region_id: c.id })} /></div><div><Label>Address</Label><Input aria-label={`Address ${r.order_number}`} value={r.address} onChange={e => patch(r.order_id, { address: e.target.value })} /></div></div>
        {r.state === "unclear" ? <div className="flex flex-wrap gap-2"><Input aria-label={`Tracking ${r.order_number}`} className="sm:max-w-48" placeholder="Onway tracking" value={tracking[r.order_id] || ""} onChange={e => setTracking(old => ({ ...old, [r.order_id]: e.target.value }))} /><Button variant="outline" disabled={busy} onClick={() => run([r], "exists")}>Exists in Onway, enter tracking</Button><Button variant="destructive" disabled={busy || loading} onClick={() => run([r], "not_exists")}>Not in Onway, resend</Button></div> : <Button disabled={busy || loading} onClick={() => run([r], "confirm")}>Confirm & send</Button>}
      </section>)}</div>
    </DialogContent></Dialog>
  </>;
}