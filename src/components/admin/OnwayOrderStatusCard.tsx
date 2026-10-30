import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface Ev { id: string; status_name: string | null; comment: string | null; image: string | null; event_time: string | null }

/** Onway webhook history, planned date and latest courier problem for one order. */
export default function OnwayOrderStatusCard({ orderId, plannedDate, problemComment, problemImage }: {
  orderId: string; plannedDate?: string | null; problemComment?: string | null; problemImage?: string | null;
}) {
  const [events, setEvents] = useState<Ev[]>([]);
  useEffect(() => {
    supabase.from("onway_status_events").select("id,status_name,comment,image,event_time").eq("order_id", orderId)
      .order("event_time", { ascending: false }).limit(30).then(({ data }) => setEvents((data as Ev[]) || []));
  }, [orderId]);
  if (!events.length && !plannedDate) return null;
  const fmt = (t: string | null) => (t ? new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" }) : "");
  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <h3 className="font-bold text-sm">Onway status</h3>
      {plannedDate && <p className="text-sm">Planned delivery: <b>{new Date(plannedDate).toLocaleDateString("ka-GE")}</b></p>}
      {problemComment && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm space-y-2">
          <p><b>Courier:</b> {problemComment}</p>
          {problemImage && <a href={problemImage} target="_blank" rel="noreferrer"><img src={problemImage} alt="Courier photo" className="max-h-48 rounded" loading="lazy" /></a>}
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {events.map((e) => (
          <li key={e.id} className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">{fmt(e.event_time)}</span>
            <span className="font-medium">{e.status_name}</span>
            {e.comment && <span className="italic">— {e.comment}</span>}
            {e.image && <a href={e.image} target="_blank" rel="noreferrer" className="underline">photo</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
