import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";
import CustomerRequestsPanel from "./CustomerRequestsPanel";

/** Tracking link, page views, operator rating and customer requests for one order. */
export default function OrderTrackingInfoCard({ order }: { order: any }) {
  const [fb, setFb] = useState<{ stars: number; comment: string | null; operator: string | null } | null>(null);
  useEffect(() => {
    supabase.from("customer_feedback").select("stars, comment, operator").eq("order_id", order.id).maybeSingle().then(({ data }) => setFb(data as any));
  }, [order.id]);
  if (!order.tracking_token) return null;
  const domain = order.__store === "BIGMART" ? "bigmart.ge" : "trendmart.ge";
  const views = Number(order.tracking_view_count || 0);
  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-2 text-sm">
      <h3 className="font-bold">Customer tracking</h3>
      <p><a className="underline" href={`https://${domain}/t/${order.tracking_token}`} target="_blank" rel="noreferrer">{domain}/t/{order.tracking_token}</a></p>
      <p>{views ? `ნახა თრექინგი ${views}-ჯერ · პირველად ${new Date(order.tracking_first_seen_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })} · ბოლოს ${new Date(order.tracking_last_seen_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })}` : "თრექინგი ჯერ არ უნახავს"}</p>
      {fb && (
        <p className="flex flex-wrap items-center gap-2">Operator rating:
          <span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= fb.stars ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}</span>
          <span className="text-muted-foreground">{fb.operator}</span>{fb.comment && <span className="italic">“{fb.comment}”</span>}
        </p>
      )}
      <CustomerRequestsPanel orderId={order.id} />
    </div>
  );
}
