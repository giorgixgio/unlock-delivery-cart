import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";

interface Row { id: string; order_id: string; operator: string | null; stars: number; comment: string | null; created_at: string; orders: { public_order_number: string } | null }

/** All customer star ratings of operator calls from the tracking page. */
export default function AdminCustomerFeedback() {
  const [rows, setRows] = useState<Row[]>([]);
  const [op, setOp] = useState("all"), [stars, setStars] = useState("all");
  const [from, setFrom] = useState(""), [to, setTo] = useState("");
  useEffect(() => {
    let q = supabase.from("customer_feedback").select("id, order_id, operator, stars, comment, created_at, orders(public_order_number)").order("created_at", { ascending: false }).limit(1000);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) q = q.lte("created_at", new Date(to + "T23:59:59").toISOString());
    q.then(({ data }) => setRows((data as any) || []));
  }, [from, to]);
  const operators = useMemo(() => [...new Set(rows.map((r) => r.operator || "—"))].sort(), [rows]);
  const shown = rows.filter((r) => (op === "all" || (r.operator || "—") === op) && (stars === "all" || r.stars === Number(stars)));
  const avg = shown.length ? (shown.reduce((a, r) => a + r.stars, 0) / shown.length).toFixed(2) : "—";
  const sel = "h-10 rounded border border-input bg-background px-2 text-sm";
  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <h1 className="text-2xl font-extrabold">Customer feedback</h1>
      <div className="flex flex-wrap gap-2 items-center">
        <select aria-label="Operator" className={sel} value={op} onChange={(e) => setOp(e.target.value)}><option value="all">All operators</option>{operators.map((o) => <option key={o}>{o}</option>)}</select>
        <select aria-label="Stars" className={sel} value={stars} onChange={(e) => setStars(e.target.value)}><option value="all">All stars</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}</select>
        <input aria-label="From" type="date" className={sel} value={from} onChange={(e) => setFrom(e.target.value)} />
        <input aria-label="To" type="date" className={sel} value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="ml-auto text-sm font-semibold">{shown.length} ratings · avg {avg} ★</span>
      </div>
      <div className="bg-card rounded-lg border border-border divide-y divide-border">
        {shown.map((r) => (
          <div key={r.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
            <span className="flex">{[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= r.stars ? "fill-primary text-primary" : "text-muted-foreground"}`} />)}</span>
            {r.orders && <Link to={`/admin/orders/${r.order_id}`} className="font-semibold underline">#{r.orders.public_order_number}</Link>}
            <span className="text-muted-foreground">{r.operator || "—"}</span>
            {r.comment && <span className="basis-full italic">“{r.comment}”</span>}
            <span className="ml-auto text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })}</span>
          </div>
        ))}
        {!shown.length && <p className="p-4 text-sm text-muted-foreground">No ratings yet.</p>}
      </div>
    </div>
  );
}
