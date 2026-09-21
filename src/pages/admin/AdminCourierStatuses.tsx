import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { STATE_LABEL, STATE_BADGE, type StatusMapRow } from "@/lib/courierStates";

const STATES = [
  "DELIVERED", "FAILED_FINAL", "FAILED_ATTEMPT", "RETURNED_FAILED",
  "CANCELLED_EXCLUDED", "RETURN_COLLECTED", "RETURN_FAILED", "RETURN_CANCELLED", "IN_PROGRESS",
];

export default function AdminCourierStatuses() {
  const [rows, setRows] = useState<StatusMapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("courier_status_map").select("*").order("sort_order");
    setRows((data as any) || []);
    const { data: c } = await supabase.from("courier_shipments").select("current_courier_status");
    const map: Record<string, number> = {};
    for (const r of (c as any[]) || []) {
      const k = (r.current_courier_status || "").trim();
      map[k] = (map[k] || 0) + 1;
    }
    setCounts(map);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function save(courier_status: string, patch: Record<string, any>) {
    const { error } = await supabase.from("courier_status_map")
      .update({ ...patch, updated_at: new Date().toISOString() }).eq("courier_status", courier_status);
    if (error) { toast({ title: "ვერ შეინახა", description: error.message, variant: "destructive" }); return; }
    setRows((prev) => prev.map((r) => (r.courier_status === courier_status ? { ...r, ...patch } as StatusMapRow : r)));
  }

  const unmapped = Object.keys(counts).filter((k) => k && !rows.some((r) => r.courier_status === k));

  if (loading) {
    return <div className="p-10 flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> იტვირთება...</div>;
  }

  const StateSelect = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <select className="text-xs border rounded px-2 py-1 bg-background"
      value={value} onChange={(e) => onChange(e.target.value)}>
      {STATES.map((s) => <option key={s} value={s}>{STATE_LABEL[s] || s}</option>)}
    </select>
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">Courier Statuses</h1>
        <p className="text-sm text-muted-foreground">
          კურიერის ორიგინალი სტატუსის მნიშვნელობა ჩვენთვის. ცალკე გასული და ცალკე დაბრუნებული გზავნილისთვის.
        </p>
      </div>

      {unmapped.length > 0 && (
        <Card className="border-amber-300">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-800">უცნობი სტატუსები</CardTitle></CardHeader>
          <CardContent className="text-sm">{unmapped.join(", ")}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0 overflow-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>კურიერის სტატუსი</TableHead>
              <TableHead className="text-right">გზავნილი</TableHead>
              <TableHead>გასული → მდგომარეობა</TableHead>
              <TableHead>საბოლოო?</TableHead>
              <TableHead>დაბრუნება → მდგომარეობა</TableHead>
              <TableHead>ავიღეთ?</TableHead>
              <TableHead>უკან გზაშია?</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.courier_status}>
                  <TableCell className="text-sm font-medium">{r.courier_status}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{counts[r.courier_status] || 0}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <StateSelect value={r.outbound_state} onChange={(v) => save(r.courier_status, { outbound_state: v })} />
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${STATE_BADGE[r.outbound_state] || ""}`}>
                        {STATE_LABEL[r.outbound_state]}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.outbound_is_final}
                      onCheckedChange={(v) => save(r.courier_status, { outbound_is_final: v })} />
                  </TableCell>
                  <TableCell>
                    <StateSelect value={r.return_state} onChange={(v) => save(r.courier_status, { return_state: v })} />
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.is_return_collected}
                      onCheckedChange={(v) => save(r.courier_status, { is_return_collected: v })} />
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.is_return_in_transit}
                      onCheckedChange={(v) => save(r.courier_status, { is_return_in_transit: v })} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
