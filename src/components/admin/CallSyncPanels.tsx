import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Phone, X, ExternalLink } from "lucide-react";
import { toTelHref, type ActiveCallRecord } from "@/lib/callSync";
import { versionedOrderUpdate } from "@/lib/idempotencyService";
import { toast } from "@/hooks/use-toast";

interface CallSyncPanelsProps {
  incoming: ActiveCallRecord | null;
  onDismiss: () => void;
}

interface OrderSnapshot {
  id: string;
  public_order_number: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  region: string;
  address_line1: string;
  address_line2: string | null;
  total: number;
  internal_note: string | null;
  version: number;
  order_items: { title: string; sku: string; quantity: number; line_total: number }[];
}

/**
 * Receives incoming call-sync records:
 * - record from the phone  → order panel (details + notes while talking)
 * - record from the PC     → full-screen one-tap dial overlay
 */
const CallSyncPanels = ({ incoming, onDismiss }: CallSyncPanelsProps) => {
  const [order, setOrder] = useState<OrderSnapshot | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const isDialRequest = incoming?.source_device === "pc";

  useEffect(() => {
    if (!incoming || isDialRequest) return;
    setOrder(null);
    setNote("");
    void (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, public_order_number, status, customer_name, customer_phone, city, region, address_line1, address_line2, total, internal_note, version, order_items(title, sku, quantity, line_total)",
        )
        .eq("id", incoming.order_id)
        .maybeSingle();
      if (data) {
        const o = data as unknown as OrderSnapshot;
        setOrder(o);
        setNote(o.internal_note || "");
      }
    })();
  }, [incoming, isDialRequest]);

  if (!incoming) return null;

  const handleSaveNote = async () => {
    if (!order) return;
    setSavingNote(true);
    try {
      const newVersion = await versionedOrderUpdate(order.id, order.version, {
        internal_note: note || null,
      });
      setOrder({ ...order, internal_note: note || null, version: newVersion });
      toast({ title: "შენიშვნა შენახულია" });
    } catch (err: any) {
      toast({
        title: "შენიშვნა ვერ შეინახა",
        description: err?.message || String(err),
        variant: "destructive",
      });
    } finally {
      setSavingNote(false);
    }
  };

  // PC → Phone: full-screen one-tap dial
  if (isDialRequest) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 bg-background p-6">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-2 rounded-full text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </button>
        <p className="text-sm font-medium text-muted-foreground">შემომავალი ზარი კომპიუტერიდან</p>
        <a
          href={toTelHref(incoming.phone)}
          onClick={onDismiss}
          className="w-full max-w-sm rounded-3xl bg-primary text-primary-foreground px-6 py-8 text-center shadow-xl active:scale-95 transition-transform"
        >
          <Phone className="w-10 h-10 mx-auto mb-3" />
          <div className="text-3xl font-extrabold tracking-wide">{incoming.phone}</div>
          {incoming.customer_name && (
            <div className="mt-1 text-lg font-semibold opacity-90">{incoming.customer_name}</div>
          )}
          <div className="mt-3 text-sm font-medium opacity-80">შეეხე დასარეკად</div>
        </a>
      </div>
    );
  }

  // Phone → PC: order panel
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <div className="flex items-center gap-2 text-sm font-bold text-primary">
          <Phone className="w-4 h-4 animate-pulse" />
          ზარი მიმდინარეობს — {incoming.phone}
        </div>

        {!order ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">#{order.public_order_number}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold capitalize bg-muted">
                  {order.status.replace("_", " ")}
                </span>
                <span className="ml-auto font-bold">{Number(order.total).toFixed(2)} ₾</span>
              </div>
              <div className="text-lg font-extrabold mt-1">{order.customer_name || "—"}</div>
              <div className="text-sm text-muted-foreground">{order.customer_phone}</div>
            </div>

            <div className="rounded-lg border border-border p-2.5 text-sm">
              <div className="font-medium">{order.city}{order.region ? `, ${order.region}` : ""}</div>
              <div className="text-muted-foreground">
                {order.address_line1}
                {order.address_line2 ? ` · ${order.address_line2}` : ""}
              </div>
            </div>

            <div className="rounded-lg border border-border p-2.5">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">პროდუქტები</div>
              <ul className="space-y-1 text-sm">
                {order.order_items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">{item.title} × {item.quantity}</span>
                    <span className="shrink-0 font-medium">{Number(item.line_total).toFixed(2)} ₾</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5">შენიშვნა</div>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="დაწერე შენიშვნა საუბრისას…"
                rows={3}
                className="text-base"
              />
              <div className="flex gap-2 mt-2">
                <Button size="sm" onClick={handleSaveNote} disabled={savingNote} className="gap-1.5">
                  {savingNote && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  შენახვა
                </Button>
                <Button size="sm" variant="outline" asChild className="gap-1.5">
                  <Link to={`/admin/orders/${order.id}`} onClick={onDismiss}>
                    <ExternalLink className="w-3.5 h-3.5" /> სრული შეკვეთა
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CallSyncPanels;
