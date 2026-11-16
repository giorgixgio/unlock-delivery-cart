import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  OPEN_STATUSES, REASON_LABEL, STATUS_LABEL, assignTicket, hasUnreadReply, isOverdue, markTicketSeen,
  postTicketUpdate, releaseToQueue, resolveTicket, sendReplacement, sortTickets,
} from "@/lib/supportTickets";
import SupportSettingsCard from "@/components/admin/issues/SupportSettingsCard";
import RefundsPanel, { RefundLinkButton, type RefundRow } from "@/components/admin/issues/RefundsPanel";

interface Ticket {
  id: string; order_id: string; status: string; payload: any; created_at: string; created_by: string | null; assigned_to: string | null;
  sla_due_at: string | null; last_customer_reply_at: string | null; last_admin_update_at: string | null; staff_seen_at: string | null; resolution: string | null;
  orders: { public_order_number: string; customer_phone: string | null; support_hold: boolean; status: string; order_items: { title: string; quantity: number }[] } | null;
}
interface Msg { id: string; author_type: string; author: string | null; body: string; link_url: string | null; video_url: string | null; status_set: string | null; notify_customer: boolean; created_at: string }
interface Sms { id: string; type: string; status: string; send_after: string; sent_at: string | null; last_error: string | null }

const fmt = (t: string) => new Date(t).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const age = (t: string) => { const h = Math.floor((Date.now() - new Date(t).getTime()) / 3600_000); return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`; };

export default function AdminIssues() {
  const { user } = useAdminAuth();
  const me = (user?.email || "").toLowerCase();
  const [rows, setRows] = useState<Ticket[]>([]);
  const [view, setView] = useState<"open" | "resolved">("open");
  const [mine, setMine] = useState(false);
  const [tab, setTab] = useState<"cant_use" | "other" | "refunds">("cant_use");
  const [refunds, setRefunds] = useState<Record<string, RefundRow>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await (supabase as any).from("customer_requests")
      .select("id, order_id, status, payload, created_at, created_by, assigned_to, sla_due_at, last_customer_reply_at, last_admin_update_at, staff_seen_at, resolution, orders(public_order_number, customer_phone, support_hold, status, order_items(title, quantity))")
      .eq("kind", "operator_flag").in("status", view === "open" ? OPEN_STATUSES : ["resolved", "done"])
      .order("created_at", { ascending: view === "open" }).limit(200);
    const { data: rf } = await (supabase as any).from("refund_requests").select("*, orders(public_order_number, customer_phone)").order("sent_at", { ascending: false }).limit(500);
    setRefunds(Object.fromEntries((rf || []).map((r: RefundRow) => [r.request_id, r])));
    setRows(data || []); setLoading(false);
  }, [view]);
  useEffect(() => { void load(); const t = window.setInterval(load, 60_000); return () => window.clearInterval(t); }, [load]);

  const shown = useMemo(() => {
    const byTab = rows.filter((t) => (t.payload?.reason === "cant_use") === (tab === "cant_use"));
    const r = mine ? byTab.filter((t) => (t.assigned_to || "").toLowerCase() === me) : byTab;
    return view === "open" ? sortTickets(r) : r;
  }, [rows, mine, me, view, tab]);
  const current = rows.find((r) => r.id === openId) || null;

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">⚑ Issues</h1>
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant={view === "open" ? "default" : "outline"} onClick={() => setView("open")}>Open</Button>
          <Button size="sm" variant={view === "resolved" ? "default" : "outline"} onClick={() => setView("resolved")}>Resolved</Button>
          <Button size="sm" variant={!mine ? "secondary" : "ghost"} onClick={() => setMine(false)}>All</Button>
          <Button size="sm" variant={mine ? "secondary" : "ghost"} onClick={() => setMine(true)}>Mine</Button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {([["cant_use", "🛠 ვერ იყენებს", rows.filter((t) => t.payload?.reason === "cant_use").length], ["other", "სხვა", rows.filter((t) => t.payload?.reason !== "cant_use").length], ["refunds", "💸 დაბრუნებები", Object.values(refunds).filter((r) => r.status === "submitted").length]] as const).map(([k, label, n]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-2 py-2 text-sm font-semibold ${tab === k ? "bg-background shadow" : "text-muted-foreground"}`}>
            {label} <span className="ml-1 rounded bg-primary/15 px-1.5 text-xs">{n}</span>
          </button>
        ))}
      </div>
      {tab === "refunds" ? <RefundsPanel rows={Object.values(refunds)} onChanged={load} /> : loading ? <p className="text-sm text-muted-foreground">Loading…</p> : !shown.length ? <p className="text-sm text-muted-foreground">No issues.</p> : (
        <div className="divide-y rounded-lg border border-border bg-card">
          {shown.map((t) => {
            const unread = hasUnreadReply(t), overdue = isOverdue(t);
            return (
              <div key={t.id} className="p-0">
              <button type="button" onClick={() => { setOpenId(t.id); if (unread) void markTicketSeen(t.id).then(load); }}
                className="flex w-full flex-wrap items-center gap-2 p-2.5 text-left text-sm hover:bg-muted">
                <span className="font-semibold">#{t.orders?.public_order_number}</span>
                {t.orders?.customer_phone && <a href={`tel:${t.orders.customer_phone}`} onClick={(e) => e.stopPropagation()} className="underline">{t.orders.customer_phone}</a>}
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{REASON_LABEL[t.payload?.reason] || t.payload?.reason}</span>
                {t.payload?.text && <span className="max-w-xs truncate italic text-muted-foreground">“{t.payload.text}”</span>}
                <span className="text-xs text-muted-foreground">{t.payload?.by_operator}</span>
                <span className="ml-auto flex items-center gap-1.5">
                  {unread && <span className="rounded bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">💬 reply</span>}
                  {view === "open" && t.sla_due_at && <span className={`rounded px-1.5 py-0.5 text-xs font-bold ${overdue ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>SLA {fmt(t.sla_due_at)}</span>}
                  <span className="text-xs text-muted-foreground">{STATUS_LABEL[t.status]} · {age(t.created_at)}</span>
                </span>
              </button>
              </div>
            );
          })}
        </div>
      )}
      <SupportSettingsCard />
      <Sheet open={!!current} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {current && <IssueDetail ticket={current} refund={refunds[current.id]} onChanged={load} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function IssueDetail({ ticket, refund, onChanged }: { ticket: Ticket; refund?: RefundRow; onChanged: () => void }) {
  const { toast } = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [sms, setSms] = useState<Sms[]>([]);
  const [body, setBody] = useState(""); const [link, setLink] = useState(""); const [video, setVideo] = useState("");
  const [status, setStatus] = useState<string | null>(null); const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState(ticket.assigned_to || "");
  const [busy, setBusy] = useState(false);
  const open = OPEN_STATUSES.includes(ticket.status);

  const load = useCallback(async () => {
    const [{ data: m }, { data: s }] = await Promise.all([
      (supabase as any).from("support_ticket_messages").select("*").eq("request_id", ticket.id).order("created_at"),
      (supabase as any).from("sms_queue").select("id, type, status, send_after, sent_at, last_error").eq("request_id", ticket.id).order("send_after"),
    ]);
    setMsgs(m || []); setSms(s || []);
  }, [ticket.id]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast({ title: ok }); await load(); onChanged(); }
    catch (e: any) { toast({ title: "Failed", description: e?.message, variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <Link to={`/admin/orders/${ticket.order_id}`} className="underline">#{ticket.orders?.public_order_number}</Link>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{REASON_LABEL[ticket.payload?.reason]}</span>
          <span className="text-xs text-muted-foreground">{STATUS_LABEL[ticket.status]}</span>
        </SheetTitle>
      </SheetHeader>
      <div className="text-sm text-muted-foreground">
        {ticket.orders?.customer_phone && <a href={`tel:${ticket.orders.customer_phone}`} className="font-semibold text-foreground underline">{ticket.orders.customer_phone}</a>}
        {" · "}{(ticket.orders?.order_items || []).map((i) => `${i.title} ×${i.quantity}`).join(", ")}
      </div>

      {(open || refund) && (
        <div className="space-y-3 rounded-xl border-2 border-primary/40 bg-card p-3">
          <div className="text-base font-bold">შედეგი — აირჩიე ერთი</div>
          <div className="space-y-1">
            <RefundLinkButton ticketId={ticket.id} refund={refund} onDone={() => { void load(); onChanged(); }} />
            <p className="text-xs text-muted-foreground">კლიენტს მიდის SMS ბმული: წერს სახელს, IBAN-ს (და ფოტოს/ვიდეოს თუ მონიშნე). გადარიცხვის შემდეგ „💸 დაბრუნებები“ ტაბში მონიშნე „დაბრუნებულია“.</p>
          </div>
          {open && <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="შენიშვნა (არასავალდებულო)" className="text-base" />
            <div className="space-y-1">
              <Button variant="secondary" className="h-12 w-full text-base font-bold" disabled={busy} onClick={() => {
                if (!confirm("შეიქმნება ახალი დადასტურებული შეკვეთა იგივე პროდუქტით, ჯამი 0₾. გავაგრძელო?")) return;
                void run(async () => { const r: any = await sendReplacement(ticket.id, note); toast({ title: `📦 ახალი შეკვეთა #${r?.public_order_number}` }); }, "შეცვლა გაიგზავნა");
              }}>📦 იგივე პროდუქტის ხელახლა გაგზავნა (0₾)</Button>
              <p className="text-xs text-muted-foreground">იქმნება ახალი დადასტურებული შეკვეთა იგივე პროდუქტით, კლიენტი არაფერს იხდის. Issue იხურება.</p>
            </div>
            <div className="space-y-1">
              <Button variant="outline" className="h-12 w-full text-base font-bold" disabled={busy} onClick={() => {
                if (!confirm("Issue დაიხურება ყოველგვარი მოქმედების გარეშე. გავაგრძელო?")) return;
                void run(() => resolveTicket(ticket.id, "other", note), "დასრულდა");
              }}>✔️ დასრულება სხვა მიზეზით</Button>
              <p className="text-xs text-muted-foreground">არც თანხა ბრუნდება, არც პროდუქტი იგზავნება — მაგ. ვერ დავუკავშირდით, აღარ აინტერესებს. უბრალოდ იხურება.</p>
            </div>
          </>}
        </div>
      )}

      <ul className="space-y-2">
        {msgs.map((m) => (
          <li key={m.id} className={`rounded-lg p-2 text-sm ${m.author_type === "customer" ? "bg-primary/10" : m.author_type === "system" ? "bg-muted/50 text-muted-foreground" : "bg-muted"}`}>
            <div className="text-xs text-muted-foreground">{m.author_type}{m.author && m.author_type !== "customer" ? ` · ${m.author}` : ""} · {fmt(m.created_at)}{m.notify_customer ? " · 📱" : ""}</div>
            <div className="whitespace-pre-wrap">{m.body}</div>
            {m.link_url && <a className="text-xs underline" href={m.link_url} target="_blank" rel="noreferrer">{m.link_url}</a>}
            {m.video_url && <a className="block text-xs underline" href={m.video_url} target="_blank" rel="noreferrer">🎬 {m.video_url}</a>}
          </li>
        ))}
      </ul>
      {!!sms.length && (
        <div className="space-y-1 text-xs">
          <div className="font-semibold">SMS</div>
          {sms.map((s) => <div key={s.id}>{s.type.replace("support_", "")} · {s.status} · {fmt(s.sent_at || s.send_after)}{s.last_error ? ` · ${s.last_error}` : ""}</div>)}
        </div>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          <div className="text-sm font-semibold">Post update</div>
          <textarea value={body} maxLength={1000} rows={3} onChange={(e) => setBody(e.target.value)} className="w-full rounded-md border border-input bg-background p-2 text-base" placeholder="Visible to the customer on their page" />
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (optional)" className="text-base" />
          <Input value={video} onChange={(e) => setVideo(e.target.value)} placeholder="Video URL (optional)" className="text-base" />
          <div className="flex flex-wrap gap-1">
            {["in_review", "waiting_customer"].map((s) => (
              <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(status === s ? null : s)}>{STATUS_LABEL[s]}</Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify customer by SMS</label>
          <Button disabled={busy || !body.trim()} onClick={() => run(async () => {
            const r = await postTicketUpdate(ticket.id, body, link, video, status, notify);
            setBody(""); setLink(""); setVideo(""); setStatus(null);
            if (notify && !r.sms_queued) toast({ title: "Update saved, no SMS queued (texts off or limit)" });
          }, "Update posted")}>Post update</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Assign to (email, optional)" className="h-9 max-w-[220px] text-base" />
        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => assignTicket(ticket.id, assignee), "Assigned")}>Assign</Button>
        {ticket.orders?.support_hold && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => releaseToQueue(ticket.order_id), "Back in the call queue")}>Release to queue</Button>}
        <Button size="sm" variant="ghost" disabled title="Coming later">Flag customer</Button>
      </div>
    </div>
  );
}
