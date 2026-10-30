import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ACTIONS = ["none", "out_for_delivery", "delivery_failed", "delivered", "pickup_problem"] as const;
interface Row { status_id: string; status_name: string | null; action: string; last_seen_at: string | null; seen_count: number }

/** Every Onway status ever received; only mapped actions trigger SMS/alerts. */
export default function OnwayStatusMapPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    supabase.from("onway_status_map").select("status_id,status_name,action,last_seen_at,seen_count").order("last_seen_at", { ascending: false, nullsFirst: false })
      .then(({ data }) => setRows((data as Row[]) || []));
  }, []);
  const setAction = async (id: string, action: string) => {
    const { error } = await supabase.from("onway_status_map").update({ action, updated_at: new Date().toISOString() }).eq("status_id", id);
    if (error) { toast.error("Not saved"); return; }
    setRows((r) => r.map((x) => (x.status_id === id ? { ...x, action } : x)));
    toast.success("Status action saved");
  };
  return (
    <div className="bg-card rounded-lg p-4 border border-border space-y-3">
      <h3 className="font-bold text-sm">Onway statuses</h3>
      <p className="text-xs text-muted-foreground">New statuses appear here automatically with action “none”. Choose an action to start texts or alerts for it.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1">ID</th><th>Status</th><th>Last seen</th><th>Count</th><th>Action</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.status_id} className="border-t border-border">
                <td className="py-2">{r.status_id}</td>
                <td>{r.status_name}</td>
                <td className="text-xs">{r.last_seen_at ? new Date(r.last_seen_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" }) : "—"}</td>
                <td>{r.seen_count}</td>
                <td>
                  <select aria-label={`Action for ${r.status_id}`} value={r.action} onChange={(e) => setAction(r.status_id, e.target.value)}
                    className="h-9 rounded border border-input bg-background px-2 text-sm">
                    {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
