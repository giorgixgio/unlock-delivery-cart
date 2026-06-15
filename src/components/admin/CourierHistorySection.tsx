import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DERIVED_LABEL, DERIVED_BADGE, DerivedStatus, SHIPMENT_TYPE_LABEL } from "@/lib/courierStatus";

type Props = { orderId?: string | null; trackingNumber?: string | null };

export default function CourierHistorySection({ orderId, trackingNumber }: Props) {
  const [shipment, setShipment] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase.from("courier_shipments").select("*").limit(1);
      if (orderId) q = q.eq("original_order_id", orderId);
      else if (trackingNumber) q = q.eq("tracking_number", trackingNumber);
      else { setLoading(false); return; }
      const { data: ships } = await q;
      let ship = ships?.[0];
      if (!ship && trackingNumber) {
        const { data } = await supabase.from("courier_shipments").select("*").eq("tracking_number", trackingNumber).maybeSingle();
        ship = data || null;
      }
      setShipment(ship);
      if (ship) {
        const { data: hist } = await supabase.from("courier_status_history")
          .select("*").eq("courier_shipment_id", ship.id)
          .order("status_date", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false });
        setHistory(hist || []);
      }
      setLoading(false);
    })();
  }, [orderId, trackingNumber]);

  if (loading) return null;
  if (!shipment) return null;

  const ds = (shipment.derived_status as DerivedStatus) || "UNKNOWN";

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Courier History</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center text-sm">
          <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{shipment.tracking_number}</span>
          <span className={`px-2 py-0.5 rounded border text-xs font-semibold ${DERIVED_BADGE[ds]}`}>{DERIVED_LABEL[ds]}</span>
          <span className="text-xs text-muted-foreground">{SHIPMENT_TYPE_LABEL[(shipment.shipment_type as any) || "UNKNOWN"]}</span>
          <span className="text-xs">{shipment.current_courier_status}</span>
        </div>
        {shipment.linked_return_tracking_number && (
          <p className="text-xs text-orange-700">↩ უკან დაბრუნდა → <span className="font-mono">{shipment.linked_return_tracking_number}</span></p>
        )}
        {shipment.linked_original_tracking_number && (
          <p className="text-xs text-blue-700">← ორიგინალი → <span className="font-mono">{shipment.linked_original_tracking_number}</span></p>
        )}
        <div className="border-t pt-3">
          <p className="text-xs font-semibold mb-2">Status timeline ({history.length})</p>
          <ol className="space-y-1.5">
            {history.map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-xs">
                <span className="text-muted-foreground w-32 shrink-0">{h.status_date ? new Date(h.status_date).toLocaleString() : "—"}</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] ${DERIVED_BADGE[(h.derived_status as DerivedStatus) || "UNKNOWN"]}`}>
                  {DERIVED_LABEL[(h.derived_status as DerivedStatus) || "UNKNOWN"]}
                </span>
                <span className="flex-1">{h.courier_status}</span>
                {Number(h.cod_amount) > 0 && <span className="text-green-700">₾{h.cod_amount}</span>}
              </li>
            ))}
            {history.length === 0 && <li className="text-xs text-muted-foreground">No history yet</li>}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
