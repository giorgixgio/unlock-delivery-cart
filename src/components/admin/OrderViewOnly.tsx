import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Loader2, Eye } from "lucide-react";
import OrderStatusChip, { fmtDateTime } from "@/components/admin/OrderStatusChip";
import PreviousOrdersPanel from "@/components/admin/order-review/PreviousOrdersPanel";
import OrderActivityLog from "@/components/admin/OrderActivityLog";
import { CANCEL_REASON_LABEL } from "@/lib/cancelReasons";

const SELECT =
  "id, public_order_number, created_at, status, customer_name, customer_phone, city, normalized_city, address_line1, address_line2, normalized_address, notes_customer, internal_note, subtotal, shipping_fee, discount_total, total, is_return, is_confirmed, auto_confirmed, is_fulfilled, call_outcome, call_attempt_count, next_call_after, final_cancel_reason, final_cancel_note, onway_sent_at, onway_tracking, tracking_number, packed_at, packing_wave_id, merged_into_order_id, onway_last_status, onway_last_status_at, order_items(id, sku, title, quantity, unit_price, line_total, image_url)";

/** Read-only order screen for operators: everything visible, nothing editable, no action buttons. */
export default function OrderViewOnly({ orderId }: { orderId: string }) {
  const { user } = useAdminAuth();
  const [o, setO] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    supabase.from("orders").select(SELECT).eq("id", orderId).maybeSingle().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      setO(data);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [orderId]);

  if (loading) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (error) return <p className="p-4 text-destructive text-sm">{error}</p>;
  if (!o) return <p className="p-4 text-sm text-muted-foreground">შეკვეთა ვერ მოიძებნა</p>;

  const items: any[] = o.order_items || [];
  const city = o.normalized_city || o.city;
  const address = o.normalized_address || [o.address_line1, o.address_line2].filter(Boolean).join(", ");
  const reason = o.final_cancel_reason ? (CANCEL_REASON_LABEL as Record<string, string>)[o.final_cancel_reason] || o.final_cancel_reason : null;
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex gap-2 text-sm"><span className="w-28 shrink-0 text-muted-foreground">{k}</span><span className="min-w-0 break-words">{v || "—"}</span></div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm font-semibold">
        <Eye className="w-4 h-4" /> მხოლოდ ნახვა / View only — ცვლილებები ზარების რიგიდან / changes are made from the Call Queue
      </div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>#{o.public_order_number} · {fmtDateTime(o.created_at)}</span>
            <OrderStatusChip o={o} />
            {o.onway_last_status && <span className="rounded-full border border-purple-300 bg-purple-50 text-purple-800 px-2 py-0.5 font-semibold">Onway: {o.onway_last_status}</span>}
          </div>
          <div className="text-lg font-extrabold">{o.customer_name}</div>
          <div className="text-sm">{o.customer_phone}</div>
        </div>
        <div className="text-2xl font-extrabold">{Number(o.total || 0).toFixed(2)} ₾</div>
      </div>

      <PreviousOrdersPanel order={o} currentSkus={items.map((i) => i.sku)} actor={user?.email || ""} accordion readOnly />

      <div className="rounded-lg border border-border p-3 space-y-1.5">
        <Row k="ქალაქი" v={city} />
        <Row k="მისამართი" v={address} />
        <Row k="კლიენტის შენიშვნა" v={o.notes_customer} />
        <Row k="შენიშვნა" v={o.internal_note} />
        {reason && <Row k="გაუქმების მიზეზი" v={[reason, o.final_cancel_note].filter(Boolean).join(" — ")} />}
        {Number(o.call_attempt_count || 0) > 0 && <Row k="ზარები" v={`${o.call_attempt_count} უპასუხო ზარი`} />}
        {o.next_call_after && <Row k="გადარეკვა" v={fmtDateTime(o.next_call_after)} />}
        {(o.onway_tracking || o.tracking_number) && <Row k="ტრეკინგი" v={o.onway_tracking || o.tracking_number} />}
        {o.onway_last_status_at && <Row k="Onway განახლდა" v={fmtDateTime(o.onway_last_status_at)} />}
      </div>

      <div className="rounded-lg border border-border divide-y divide-border">
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-2 p-2 text-sm">
            {i.image_url && <img src={i.image_url} alt="" className="w-10 h-10 rounded object-cover border border-border" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{i.title}</div>
              <div className="text-xs text-muted-foreground">{i.sku} · {i.quantity} × {Number(i.unit_price || 0).toFixed(2)} ₾</div>
            </div>
            <b>{Number(i.line_total || 0).toFixed(2)} ₾</b>
          </div>
        ))}
        <div className="p-2 text-sm space-y-0.5">
          <div className="flex justify-between"><span className="text-muted-foreground">პროდუქტები</span><span>{Number(o.subtotal || 0).toFixed(2)} ₾</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">მიწოდება</span><span>{Number(o.shipping_fee || 0).toFixed(2)} ₾</span></div>
          {Number(o.discount_total || 0) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">ფასდაკლება</span><span>−{Number(o.discount_total).toFixed(2)} ₾</span></div>}
          <div className="flex justify-between font-extrabold"><span>სულ</span><span>{Number(o.total || 0).toFixed(2)} ₾</span></div>
        </div>
      </div>

      <OrderActivityLog orderId={o.id} />
    </div>
  );
}
