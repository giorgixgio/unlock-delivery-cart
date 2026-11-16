import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export interface RefundRow {
  id: string; request_id: string; order_id: string; token: string; phone: string | null; amount: number | null;
  status: "sent" | "submitted" | "refunded"; full_name: string | null; iban: string | null; sms_status: string | null; sms_error: string | null;
  sent_by: string | null; sent_at: string; opened_at: string | null; submitted_at: string | null; refunded_at: string | null; refunded_by: string | null;
  orders?: { public_order_number: string; customer_phone: string | null } | null;
}
const fmt = (t: string | null) => t ? new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export function RefundLinkButton({ ticketId, refund, onDone }: { ticketId: string; refund?: RefundRow; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (refund && refund.status !== "sent") {
    return <div className={`rounded-lg px-3 py-2 text-sm font-semibold ${refund.status === "refunded" ? "bg-primary/15" : "bg-accent"}`}>
      {refund.status === "refunded" ? "✅ თანხა დაბრუნებულია" : "📝 კლიენტმა შეავსო საბანკო მონაცემები"}
    </div>;
  }
  const send = async () => {
    if (refund && !confirm("ბმული უკვე გაგზავნილია. ხელახლა გავგზავნო?")) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("refund-request", { body: { action: "send", request_id: ticketId } });
    setBusy(false);
    if (error || !data?.ok && data?.sms !== "skipped_test") toast({ title: "ვერ გაიგზავნა", description: data?.error || error?.message, variant: "destructive" });
    else toast({ title: data.sms === "skipped_test" ? "ტესტ შეკვეთა — SMS არ გაიგზავნა" : "SMS გაიგზავნა ✅", description: data.link });
    onDone();
  };
  return (
    <Button type="button" onClick={send} disabled={busy} className="h-12 w-full text-base font-bold">
      {busy ? "იგზავნება…" : refund ? `🔁 ბმული გაგზავნილია (${fmt(refund.sent_at)}${refund.opened_at ? ", გახსნა" : ""}) — ხელახლა` : "💸 თანხის დაბრუნების ბმულის გაგზავნა"}
    </Button>
  );
}

export default function RefundsPanel({ rows, onChanged }: { rows: RefundRow[]; onChanged: () => void }) {
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"submitted" | "sent" | "refunded">("submitted");
  const shown = rows.filter((r) => r.status === filter);
  const mark = async (r: RefundRow) => {
    if (!confirm(`#${r.orders?.public_order_number} — ${r.amount}₾ დაბრუნებულად მოვნიშნო?`)) return;
    const { error } = await (supabase as any).from("refund_requests").update({ status: "refunded", refunded_at: new Date().toISOString(), refunded_by: user?.email }).eq("id", r.id).eq("status", "submitted");
    if (error) toast({ title: "ვერ მოინიშნა", description: error.message, variant: "destructive" }); else toast({ title: "მოინიშნა ✅" });
    onChanged();
  };
  const tabs: [typeof filter, string][] = [["submitted", "📝 შეავსეს — გადასარიცხი"], ["sent", "⏳ არ შეუვსიათ"], ["refunded", "✅ დაბრუნებული"]];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tabs.map(([k, l]) => <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>{l} ({rows.filter((r) => r.status === k).length})</Button>)}
      </div>
      {!shown.length ? <p className="text-sm text-muted-foreground">ცარიელია.</p> : (
        <div className="divide-y rounded-lg border border-border bg-card">
          {shown.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
              <span className="font-semibold">#{r.orders?.public_order_number}</span>
              {r.phone && <a href={`tel:${r.phone}`} className="underline">{r.phone}</a>}
              <span className="font-bold">{Number(r.amount || 0).toFixed(2)}₾</span>
              {r.full_name && <span>{r.full_name}</span>}
              {r.iban && <button type="button" className="rounded bg-muted px-2 py-1 font-mono text-xs" onClick={() => { void navigator.clipboard.writeText(r.iban!); toast({ title: "IBAN დაკოპირდა" }); }}>{r.iban} 📋</button>}
              <span className="text-xs text-muted-foreground">
                გაგზავნა {fmt(r.sent_at)}{r.sms_status && r.sms_status !== "sent" ? ` (SMS: ${r.sms_status})` : ""} · გახსნა {fmt(r.opened_at)}{r.submitted_at ? ` · შეავსო ${fmt(r.submitted_at)}` : ""}{r.refunded_at ? ` · დაბრუნდა ${fmt(r.refunded_at)} (${r.refunded_by})` : ""}
              </span>
              {r.status === "submitted" && <Button size="sm" className="ml-auto" onClick={() => mark(r)}>✅ დაბრუნებულია</Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
