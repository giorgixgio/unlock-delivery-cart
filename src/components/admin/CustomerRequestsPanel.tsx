import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

const KIND: Record<string, string> = {
  change_address: "Address change", change_day: "Day change", call_me: "Call me", cancel_save: "Wants to cancel — call to save", self_canceled: "Cancelled by customer",
};
const REASON: Record<string, string> = { cant_afford: "ვეღარ ვიყიდი", too_expensive: "ძვირია", bought_elsewhere: "სხვაგან ვიყიდე", accidental: "შემთხვევით შევუკვეთე", other: "სხვა" };
interface Row { id: string; order_id: string; kind: string; priority: boolean; payload: any; status: string; created_at: string; orders?: { public_order_number: string; customer_name: string | null; customer_phone: string | null } | null }

/** Operator tasks created from the customer tracking page. With orderId: that order's history. */
export default function CustomerRequestsPanel({ orderId }: { orderId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => {
    let q = supabase.from("customer_requests").select("*, orders(public_order_number, customer_name, customer_phone)").order("created_at", { ascending: false }).limit(100);
    q = orderId ? q.eq("order_id", orderId) : q.eq("status", "open");
    q.then(({ data }) => setRows(((data as any) || []).sort((a: Row, b: Row) => Number(b.priority) - Number(a.priority))));
  };
  useEffect(load, [orderId]);
  if (!rows.length) return null;
  const done = async (id: string) => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("customer_requests").update({ status: "done", resolved_at: new Date().toISOString(), resolved_by: u.user?.email ?? null }).eq("id", id);
    load();
  };
  return (
    <div className="rounded-lg border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
      <h3 className="font-bold text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4" />Customer requests ({rows.length})</h3>
      {rows.map((r) => (
        <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-md bg-card border p-2 text-sm ${r.priority && r.status === "open" ? "border-destructive border-2" : "border-border"}`}>
          {r.priority && r.status === "open" && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">Priority</span>}
          {!orderId && r.orders && <Link to={`/admin/orders/${r.order_id}`} className="font-semibold underline">#{r.orders.public_order_number}</Link>}
          {!orderId && r.orders?.customer_phone && <a href={`tel:${r.orders.customer_phone}`} className="underline">{r.orders.customer_phone}</a>}
          <span className="font-medium">{KIND[r.kind] || r.kind}</span>
          {r.payload?.address && <span>📍 {r.payload.address}</span>}
          {r.payload?.day && <span>📅 {r.payload.day}</span>}
          {r.payload?.reason && <span>{REASON[r.payload.reason] || r.payload.reason}</span>}
          {r.payload?.text && <span className="italic">“{r.payload.text}”</span>}
          <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })}</span>
          {r.status === "open" ? <Button size="sm" variant="outline" className="ml-auto" onClick={() => done(r.id)}>Done</Button> : <span className="ml-auto text-xs text-muted-foreground">done</span>}
        </div>
      ))}
    </div>
  );
}
