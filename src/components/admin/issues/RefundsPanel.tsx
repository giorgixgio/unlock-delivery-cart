import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

export interface RefundRow {
  id: string; request_id: string; order_id: string; token: string; phone: string | null; amount: number | null;
  status: "sent" | "submitted" | "approved" | "bank_submitted" | "refunded"; approved_at?: string | null; approved_by?: string | null; bank_submitted_at?: string | null; full_name: string | null; iban: string | null; sms_status: string | null; sms_error: string | null;
  sent_by: string | null; sent_at: string; opened_at: string | null; submitted_at: string | null; refunded_at: string | null; refunded_by: string | null;
  evidence_required?: boolean; evidence?: string[] | null;
  orders?: { public_order_number: string; customer_phone: string | null } | null;
}
const fmt = (t: string | null) => t ? new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** Customer photos/videos from the refund page (private storage, short-lived signed links). */
export function EvidenceThumbs({ paths }: { paths: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!paths.length) return;
    void supabase.storage.from("refund-evidence").createSignedUrls(paths, 3600).then(({ data }) => setUrls((data || []).map((d) => d.signedUrl || "")));
  }, [paths.join("|")]);
  if (!paths.length) return null;
  return <div className="flex flex-wrap gap-1.5">
    {paths.map((p, i) => {
      const u = urls[i]; const vid = /\.(mp4|mov|webm|m4v|3gp|qt)$/i.test(p);
      return <a key={p} href={u || undefined} target="_blank" rel="noreferrer" className="block h-16 w-16 overflow-hidden rounded border border-border bg-muted">
        {u ? (vid ? <video src={u} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={u} alt="" className="h-full w-full object-cover" />) : null}
      </a>;
    })}
  </div>;
}
const missingEvidence = (r: RefundRow) => !!r.evidence_required && !(r.evidence || []).length;

async function approveRefund(r: RefundRow, toast: ReturnType<typeof useToast>["toast"]) {
  if (!confirm(`#${r.orders?.public_order_number ?? ""} — ${r.amount}₾ დაბრუნებას ამტკიცებ? კლიენტს მიუვა SMS IBAN-ის მოთხოვნით.`)) return false;
  const { data, error } = await supabase.functions.invoke("refund-request", { body: { action: "approve", request_id: r.request_id } });
  if (error || !data?.ok) { toast({ title: "ვერ გაიგზავნა", description: data?.error || error?.message, variant: "destructive" }); return false; }
  toast({ title: "დამტკიცდა — IBAN-ის SMS გაიგზავნა ✅" }); return true;
}
const STAGE: Record<string, string> = {
  submitted: "📝 კლიენტმა ატვირთა ფოტო/ვიდეო — განიხილე",
  approved: "✅ დამტკიცდა — ველოდებით IBAN-ს",
  bank_submitted: "🏦 კლიენტმა მოგვწერა IBAN — გადასარიცხი",
  refunded: "💸 თანხა დაბრუნებულია",
};

export function RefundLinkButton({ ticketId, refund, onDone }: { ticketId: string; refund?: RefundRow; onDone: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  if (refund && refund.status !== "sent") {
    return <div className={`space-y-2 rounded-lg px-3 py-2 text-sm font-semibold ${refund.status === "refunded" ? "bg-primary/15" : "bg-accent"}`}>
      <div>{STAGE[refund.status]}</div>
      {(refund.status === "submitted" || refund.status === "approved") && <Button type="button" disabled={busy} className="h-12 w-full text-base font-bold"
        onClick={async () => { setBusy(true); if (await approveRefund(refund, toast)) onDone(); setBusy(false); }}>
        {refund.status === "approved" ? "🔁 IBAN-ის SMS ხელახლა" : "✅ დაბრუნების დამტკიცება — IBAN-ის მოთხოვნა"}</Button>}
      {refund.full_name && <div className="font-normal">{refund.full_name} · <span className="font-mono text-xs">{refund.iban}</span></div>}
      {(refund.evidence || []).length ? <EvidenceThumbs paths={refund.evidence!} /> : <div className="font-normal text-muted-foreground">ფოტო/ვიდეო არ ატვირთა</div>}
    </div>;
  }
  const send = async () => {
    if (refund && !confirm("ბმული უკვე გაგზავნილია. ხელახლა გავგზავნო?")) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("refund-request", { body: { action: "send", request_id: ticketId, evidence_required: true } });
    setBusy(false);
    if (error || !data?.ok && data?.sms !== "skipped_test") toast({ title: "ვერ გაიგზავნა", description: data?.error || error?.message, variant: "destructive" });
    else toast({ title: data.sms === "skipped_test" ? "ტესტ შეკვეთა — SMS არ გაიგზავნა" : "SMS გაიგზავნა ✅", description: data.link });
    onDone();
  };
  return (
    <div className="space-y-1.5">
      <Button type="button" onClick={send} disabled={busy} className="h-12 w-full text-base font-bold">
        {busy ? "იგზავნება…" : refund ? `🔁 ბმული გაგზავნილია (${fmt(refund.sent_at)}${refund.opened_at ? ", გახსნა" : ""}) — ხელახლა` : "🔍 განხილვის ბმულის გაგზავნა (ფოტო/ვიდეო)"}
      </Button>
    </div>
  );
}

export default function RefundsPanel({ rows, onChanged }: { rows: RefundRow[]; onChanged: () => void }) {
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<RefundRow["status"]>("submitted");
  const shown = rows.filter((r) => r.status === filter);
  const mark = async (r: RefundRow) => {
    if (missingEvidence(r)) return toast({ title: "მტკიცებულება აკლია", description: "ამ კლიენტს ფოტო/ვიდეო მოეთხოვა და არ აუტვირთავს.", variant: "destructive" });
    if (!confirm(`#${r.orders?.public_order_number} — ${r.amount}₾ დაბრუნებულად მოვნიშნო?`)) return;
    const { error } = await (supabase as any).from("refund_requests").update({ status: "refunded", refunded_at: new Date().toISOString(), refunded_by: user?.email }).eq("id", r.id).eq("status", "bank_submitted");
    if (error) toast({ title: "ვერ მოინიშნა", description: error.message, variant: "destructive" }); else toast({ title: "მოინიშნა ✅" });
    onChanged();
  };
  const tabs: [typeof filter, string][] = [["submitted", "📝 განსახილველი"], ["bank_submitted", "🏦 გადასარიცხი"], ["approved", "⏳ ველოდებით IBAN-ს"], ["sent", "⏳ არ ატვირთეს"], ["refunded", "✅ დაბრუნებული"]];
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
              {r.evidence_required && <span className="rounded bg-muted px-1.5 py-0.5 text-xs">📸 სავალდებულო</span>}
              {(r.status === "submitted" || r.status === "approved") && <Button size="sm" className="ml-auto" onClick={async () => { if (await approveRefund(r, toast)) onChanged(); }}>{r.status === "approved" ? "🔁 IBAN-ის SMS" : "✅ დამტკიცება"}</Button>}
              {r.status === "bank_submitted" && <Button size="sm" className="ml-auto" onClick={() => mark(r)}>💸 გადავრიცხე</Button>}
              {!!(r.evidence || []).length && <div className="w-full"><EvidenceThumbs paths={r.evidence!} /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
