import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Row {
  id: string; public_order_number: string; customer_name: string | null; customer_phone: string | null; onway_last_status: string | null;
  onway_problem_comment: string | null; onway_problem_image: string | null; onway_problem_at: string | null;
  onway_problem_reason: string | null; onway_problem_summary: string | null;
}
const PRIORITY = new Set(["refused", "price_or_product_complaint"]);
export const REASON_LABELS: Record<string, string> = {
  no_answer: "No answer", refused: "Refused", wrong_address: "Wrong address", reschedule: "Reschedule", not_home: "Not home",
  price_or_product_complaint: "Price/product complaint", wrong_phone: "Wrong phone", other: "Other",
};

/** Orders Onway reported as problem deliveries/pickups that nobody has handled yet. Refusals first. */
export default function DeliveryProblemsPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState("all");
  const load = () => supabase.from("orders")
    .select("id,public_order_number,customer_name,customer_phone,onway_last_status,onway_problem_comment,onway_problem_image,onway_problem_at,onway_problem_reason,onway_problem_summary")
    .not("onway_problem_at", "is", null).is("onway_problem_resolved_at", null).order("onway_problem_at", { ascending: false }).limit(100)
    .then(({ data }) => setRows((data as Row[]) || []));
  useEffect(() => { load(); }, []);
  if (!rows.length) return null;
  const resolve = async (id: string) => {
    await supabase.from("orders").update({ onway_problem_resolved_at: new Date().toISOString() }).eq("id", id);
    load();
  };
  const shown = rows.filter((r) => filter === "all" || (r.onway_problem_reason || "other") === filter)
    .sort((a, b) => Number(PRIORITY.has(b.onway_problem_reason || "")) - Number(PRIORITY.has(a.onway_problem_reason || "")));
  return (
    <div className="rounded-lg border-2 border-destructive/40 bg-destructive/5 p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" />Delivery problems ({rows.length})</h3>
        <select aria-label="Filter by reason" value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-auto h-9 rounded border border-input bg-background px-2 text-sm">
          <option value="all">All reasons</option>
          {Object.entries(REASON_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      {shown.map((r) => {
        const pri = PRIORITY.has(r.onway_problem_reason || "");
        return (
          <div key={r.id} className={`flex flex-wrap items-center gap-3 rounded-md bg-card border p-2 text-sm ${pri ? "border-destructive border-2" : "border-border"}`}>
            {pri && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">Save the order — call now</span>}
            <Link to={`/admin/orders/${r.id}`} className="font-semibold underline">#{r.public_order_number}</Link>
            <span>{r.customer_name}</span>
            <a href={`tel:${r.customer_phone}`} className="underline">{r.customer_phone}</a>
            <span className="text-muted-foreground">{r.onway_last_status}</span>
            {r.onway_problem_reason && <span className="rounded bg-muted px-1.5 text-xs" title={r.onway_problem_summary || ""}>AI: {REASON_LABELS[r.onway_problem_reason] || r.onway_problem_reason}</span>}
            {r.onway_problem_comment && <span className="italic">“{r.onway_problem_comment}”</span>}
            {r.onway_problem_image && <a href={r.onway_problem_image} target="_blank" rel="noreferrer" className="underline">photo</a>}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => resolve(r.id)}>Called back</Button>
          </div>
        );
      })}
    </div>
  );
}
