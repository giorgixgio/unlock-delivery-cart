import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Minus, Plus, Repeat } from "lucide-react";
import type { HistOrder } from "@/lib/customerHistory";
import { REPLACEMENT_REASONS, type ReplacementReason, isDeliveredOrder, preselectCandidate, replacementCandidates } from "@/lib/replacementRules";

interface Props {
  open: boolean;
  /** The order the operator has open: usually a new lead, or the delivered order itself. */
  orderId: string;
  actor: string;
  onClose: () => void;
  onCreated?: (newOrderId: string, newOrderNumber: string, leadClosed: boolean) => void;
}

interface Item { id: string; title: string; sku: string; quantity: number; image_url: string | null }

export default function CreateReturnModal({ open, orderId, actor, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [candidates, setCandidates] = useState<HistOrder[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReplacementReason | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setReason(null); setNote(""); setItems([]); setQty({});
    (async () => {
      const [{ data: hist }, { data: cur }] = await Promise.all([
        supabase.rpc("operator_customer_history" as any, { p_order_id: orderId }),
        supabase.from("orders").select("id, public_order_number, created_at, status, total, onway_sent_at, onway_last_status, is_return, order_items(title, sku, quantity)").eq("id", orderId).single(),
      ]);
      if (cancelled) return;
      const list = replacementCandidates(((hist as unknown) || []) as HistOrder[]);
      // Opened on the delivered order itself (order page): offer it too.
      if (cur && !(cur as any).is_return && isDeliveredOrder({ ...(cur as any), shipment: null })) {
        list.unshift({ ...(cur as any), match_type: "phone", shipment: null, failures: [], call_attempt_count: 0 });
      }
      setCandidates(list);
      setSelected(preselectCandidate(list));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    let cancelled = false;
    supabase.from("order_items").select("id, title, sku, quantity, image_url").eq("order_id", selected).then(({ data }) => {
      if (cancelled) return;
      const rows = (data || []) as Item[];
      setItems(rows);
      setQty(Object.fromEntries(rows.map((r) => [r.id, r.quantity])));
    });
    return () => { cancelled = true; };
  }, [selected]);

  const chosen = useMemo(() => items.filter((i) => (qty[i.id] || 0) > 0), [items, qty]);
  const canSave = !!selected && !!reason && chosen.length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave || inFlight.current) return;
    inFlight.current = true; setSaving(true);
    const { data, error } = await supabase.rpc("create_replacement_order" as any, {
      p_lead_id: orderId, p_original_id: selected, p_reason: reason, p_note: note.trim() || null, p_actor: actor,
      p_items: chosen.map((i) => ({ item_id: i.id, quantity: qty[i.id] })),
    });
    inFlight.current = false; setSaving(false);
    if (error) { toast({ title: "ვერ შეიქმნა", description: error.message, variant: "destructive" }); return; }
    const r = data as any;
    toast({ title: `🔁 შეცვლა შექმნილია #${r.public_order_number}`, description: r.lead_closed ? "ლიდი დაიხურა: გადაკეთდა შეცვლად" : undefined });
    onCreated?.(r.id, r.public_order_number, !!r.lead_closed);
    onClose();
  };

  if (!open) return null;
  const sel = candidates.find((c) => c.id === selected);

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div className="bg-background w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center gap-2">
          <Repeat className="w-4 h-4 text-amber-600" />
          <h2 className="font-extrabold">შეცვლის გაგზავნა / Make Replacement</h2>
        </div>
        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : candidates.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="font-bold">ჩაბარებული შეკვეთა ვერ მოიძებნა / No delivered order to replace</p>
            <p className="text-sm text-muted-foreground">ეს ლიდი ჩვეულებრივად დაამუშავეთ.</p>
            <Button variant="outline" onClick={onClose}>დახურვა</Button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs font-bold uppercase text-muted-foreground mb-1.5">1. რომელი ჩაბარებული შეკვეთა?</div>
              <div className="space-y-1.5">
                {candidates.map((c) => (
                  <button key={c.id} type="button" onClick={() => setSelected(c.id)}
                    className={`w-full text-left rounded-lg border p-2.5 text-sm ${selected === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"}`}>
                    <div className="flex justify-between gap-2 font-bold">
                      <span>#{c.public_order_number}</span>
                      <span className="text-muted-foreground font-normal">{new Date(c.created_at).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{(c.order_items || []).map((i) => `${i.title}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}</div>
                  </button>
                ))}
              </div>
            </div>

            {sel && (
              <div>
                <div className="text-xs font-bold uppercase text-muted-foreground mb-1.5">2. რა შევცვალოთ?</div>
                <div className="space-y-1.5">
                  {items.map((it) => {
                    const q = qty[it.id] || 0;
                    return (
                      <div key={it.id} className={`flex items-center gap-2 border rounded-lg p-2 ${q ? "border-border" : "border-border opacity-50"}`}>
                        <div className="w-9 h-9 rounded border border-border overflow-hidden flex-shrink-0">{it.image_url && <img src={it.image_url} alt="" className="w-full h-full object-cover" />}</div>
                        <div className="flex-1 min-w-0"><div className="text-sm font-medium truncate">{it.title}</div><div className="text-xs text-muted-foreground">SKU {it.sku}</div></div>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setQty((m) => ({ ...m, [it.id]: Math.max(0, q - 1) }))}><Minus className="w-3 h-3" /></Button>
                        <span className="w-6 text-center font-bold text-sm">{q}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" disabled={q >= it.quantity} onClick={() => setQty((m) => ({ ...m, [it.id]: q + 1 }))}><Plus className="w-3 h-3" /></Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-bold uppercase text-muted-foreground mb-1.5">3. მიზეზი</div>
              <div className="grid grid-cols-2 gap-1.5">
                {REPLACEMENT_REASONS.map((r) => (
                  <Button key={r.key} type="button" variant={reason === r.key ? "default" : "outline"} className="h-10" onClick={() => setReason(r.key)}>{r.label}</Button>
                ))}
              </div>
              <Textarea className="mt-2 text-base" rows={2} placeholder="შენიშვნა (არასავალდებულო)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <p className="text-xs text-muted-foreground">უფასოდ გაიგზავნება ამ ლიდის მისამართზე. ძველი ნივთი არ ბრუნდება. ლიდი დაიხურება: „გადაკეთდა შეცვლად“.</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-11" onClick={onClose}>გაუქმება</Button>
              <Button className="flex-1 h-11 font-bold" disabled={!canSave} onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "შეცვლის შექმნა / Create replacement"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
