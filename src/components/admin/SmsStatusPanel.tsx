import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw } from "lucide-react";
import { fetchSmsBalance, type SmsBalance } from "@/lib/smsService";

interface SmsRow {
  id: string; order_number: string | null; phone: string | null; type: string; status: string;
  provider: string | null; delivery_status: string | null; api_message: string | null; created_at: string;
}

function DeliveryBadge({ row }: { row: SmsRow }) {
  if (row.status !== "sent") return <Badge variant={row.status === "failed" ? "destructive" : "secondary"}>{row.status === "failed" ? "Failed" : row.status === "skipped" ? "Skipped" : "Sending"}</Badge>;
  if (row.provider !== "sender.ge") return <Badge variant="secondary">Sent</Badge>;
  if (row.delivery_status === "delivered") return <Badge>Delivered</Badge>;
  if (row.delivery_status === "undelivered") return <Badge variant="destructive">Undelivered</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export default function SmsStatusPanel() {
  const [balance, setBalance] = useState<SmsBalance | null>(null);
  const [rows, setRows] = useState<SmsRow[]>([]);
  const [today, setToday] = useState<SmsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [campaigns, setCampaigns] = useState<{ campaign: string; sent: number; delivered: number; failed: number; link_opened: number; address_entered: number; self_confirmed: number; address_rate: number | null; confirmation_rate: number | null }[]>([]);
  const [campaignError, setCampaignError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const cols = "id,order_number,phone,type,status,provider,delivery_status,api_message,created_at";
    const [b, last, day, recovery] = await Promise.all([
      fetchSmsBalance(),
      supabase.from("sms_logs").select(cols).order("created_at", { ascending: false }).limit(50),
      supabase.from("sms_logs").select(cols).gte("created_at", start.toISOString()).limit(5000),
      supabase.rpc("lead_recovery_results"),
    ]);
    setBalance(b);
    setRows((last.data as SmsRow[]) || []);
    setToday((day.data as SmsRow[]) || []);
    setCampaigns(recovery.data || []);
    setCampaignError(!!recovery.error);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    await supabase.functions.invoke("sms-delivery-sync", { body: {} });
    setSyncing(false);
    void load();
  };

  const sent = today.filter(r => r.status === "sent");
  const failed = today.filter(r => r.status === "failed").length;
  const resolved = sent.filter(r => r.delivery_status === "delivered" || r.delivery_status === "undelivered");
  const deliveredPct = resolved.length ? Math.round(100 * resolved.filter(r => r.delivery_status === "delivered").length / resolved.length) : null;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">SMS</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing}>{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check delivery"}</Button>
          <Button size="sm" variant="ghost" onClick={() => void load()} aria-label="Refresh"><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Sender.ge ბალანსი" value={balance ? String(balance.balance) : "?"} sub={balance && balance.overdraft > 0 ? `ოვერდრაფტი: ${balance.overdraft}` : undefined} />
        <Stat label="Sent today" value={String(sent.length)} />
        <Stat label="Failed today" value={String(failed)} />
        <Stat label="Delivered %" value={deliveredPct === null ? "—" : `${deliveredPct}%`} />
      </div>
      <section className="space-y-2">
        <h3 className="font-semibold">SMS — მისამართი და დადასტურება</h3>
        {campaignError ? <p className="text-sm text-destructive">შედეგები ვერ ჩაიტვირთა</p> : campaigns.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th>კამპანია</th><th>გაგზავნილი</th><th>მიწოდებული</th><th>ვერ გაიგზავნა</th><th>ბმული გახსნა</th><th>მისამართი შეავსო</th><th>თვითონ დაადასტურა</th><th>მისამართი %</th><th>დადასტურება %</th></tr></thead>
              <tbody>{campaigns.map(c => <tr key={c.campaign} className="border-t border-border"><td className="py-2 pr-3 whitespace-nowrap">{c.campaign}</td><td>{c.sent}</td><td>{c.delivered}</td><td>{c.failed}</td><td>{c.link_opened}</td><td>{c.address_entered}</td><td>{c.self_confirmed}</td><td>{c.address_rate === null ? "—" : `${c.address_rate}%`}</td><td>{c.confirmation_rate === null ? "—" : `${c.confirmation_rate}%`}</td></tr>)}</tbody>
            </table>
          </div>
        ) : <p className="text-sm text-muted-foreground">კამპანია ჯერ არ გაგზავნილა</p>}
      </section>
      {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : (
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground"><tr><th className="py-1">Time</th><th>Order</th><th>Type</th><th>Phone</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-border">
                  <td className="py-1 whitespace-nowrap">{new Date(r.created_at).toLocaleString("ka-GE", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td>{r.order_number}</td><td>{r.type}</td><td>{r.phone}</td>
                  <td title={r.api_message || undefined}><DeliveryBadge row={r} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs text-destructive">{sub}</div>}
    </div>
  );
}
