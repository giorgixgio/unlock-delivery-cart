import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/** Average customer star rating per operator (from the tracking page), last 30 days. */
export default function OperatorRatingsCard() {
  const [rows, setRows] = useState<{ operator: string; n: number; avg: number }[]>([]);
  useEffect(() => {
    supabase.from("customer_feedback").select("operator, stars").gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()).limit(5000)
      .then(({ data }) => {
        const m: Record<string, number[]> = {};
        for (const r of data || []) (m[r.operator || "—"] ??= []).push(r.stars);
        setRows(Object.entries(m).map(([operator, s]) => ({ operator, n: s.length, avg: s.reduce((a, b) => a + b, 0) / s.length })).sort((a, b) => b.n - a.n));
      });
  }, []);
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="mb-1 flex items-center justify-between"><b>Customer ratings (30 days)</b><Link to="/admin/feedback" className="underline text-xs">All feedback</Link></div>
      {rows.length ? rows.map((r) => <p key={r.operator}>{r.operator}: <b>{r.avg.toFixed(2)} ★</b> <span className="text-muted-foreground">({r.n})</span></p>) : <p className="text-muted-foreground">No ratings yet.</p>}
    </div>
  );
}
