import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Row { id: string; public_order_number: string; customer_name: string | null; customer_phone: string | null; onway_last_status: string | null; onway_problem_comment: string | null; onway_problem_image: string | null; onway_problem_at: string | null }

/** Orders Onway reported as problem deliveries/pickups that nobody has handled yet. */
export default function DeliveryProblemsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const load = () => supabase.from("orders")
    .select("id,public_order_number,customer_name,customer_phone,onway_last_status,onway_problem_comment,onway_problem_image,onway_problem_at")
    .not("onway_problem_at", "is", null).is("onway_problem_resolved_at", null).order("onway_problem_at", { ascending: false }).limit(100)
    .then(({ data }) => setRows((data as Row[]) || []));
  useEffect(() => { load(); }, []);
  if (!rows.length) return null;
  const resolve = async (id: string) => {
    await supabase.from("orders").update({ onway_problem_resolved_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  return (
    <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <h3 className="font-bold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />Delivery problems ({rows.length})</h3>
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-md bg-card border border-border p-2 text-sm">
          <Link to={`/admin/orders/${r.id}`} className="font-semibold underline">#{r.public_order_number}</Link>
          <span>{r.customer_name}</span>
          <a href={`tel:${r.customer_phone}`} className="underline">{r.customer_phone}</a>
          <span className="text-muted-foreground">{r.onway_last_status}</span>
          {r.onway_problem_comment && <span className="italic">“{r.onway_problem_comment}”</span>}
          {r.onway_problem_image && <a href={r.onway_problem_image} target="_blank" rel="noreferrer" className="underline">photo</a>}
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => resolve(r.id)}>Called back</Button>
        </div>
      ))}
    </div>
  );
}
