import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useCallQueueAccess } from "@/hooks/useCallQueueAccess";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, CheckCircle2, PhoneOff, RotateCcw, XCircle, Search, Play, Pause, Square, AlertTriangle, Minus, Plus, Trash2,
} from "lucide-react";
import CallButton from "@/components/admin/CallButton";
import EditableOrderFields from "@/components/admin/EditableOrderFields";
import LandingQtyDiscountActions from "@/components/admin/LandingQtyDiscountActions";
import CancelReasonModal from "@/components/admin/CancelReasonModal";
import CallbackPickerModal from "@/components/admin/CallbackPickerModal";
import ToggleStore from "@/components/admin/ToggleStore";
import { startSession, endSession, markAction, currentSessionId } from "@/lib/operatorSession";
import { recordNoAnswerAttempt, cancelOrderWithReason, scheduleCallback } from "@/lib/callAttemptService";
import { applyOrderCancelStock } from "@/lib/stockService";
import { getTieredLineTotal, getTieredUnitPrice } from "@/lib/landingDiscounts";
import { isTbilisiCity, splitDistrict } from "@/lib/tbilisiDistricts";
import { tbilisiStartOfDay } from "@/lib/tbilisiTime";
import type { CancelReason } from "@/lib/cancelReasons";
import {
  queueNext, queueRelease, queueScheduleRetry, queueStats, queueTeamLocks, queueAssign,
  queueForceRelease, queueOverride, confirmOrderFromQueue, type QueueStats,
} from "@/lib/callQueueService";

const IDLE_MS = 3 * 60 * 1000;

interface QItem { id: string; product_id: string | null; title: string; sku: string; quantity: number; unit_price: number; line_total: number; image_url: string }
interface QOrder {
  id: string; public_order_number: string; created_at: string; status: string;
  customer_name: string; customer_phone: string; city: string; raw_city: string | null; normalized_city: string | null;
  address_line1: string; address_line2: string | null; raw_address: string | null; normalized_address: string | null;
  notes_customer: string | null; internal_note: string | null; normalization_confidence: number | null; review_required: boolean;
  subtotal: number; shipping_fee: number; discount_total: number; total: number;
  call_attempt_count: number | null; operator_viewed_at: string | null; operator_review_status: string | null;
  order_items: QItem[];
}
const ORDER_SELECT =
  "id, public_order_number, created_at, status, customer_name, customer_phone, city, raw_city, normalized_city, address_line1, address_line2, raw_address, normalized_address, notes_customer, internal_note, normalization_confidence, review_required, subtotal, shipping_fee, discount_total, total, call_attempt_count, operator_viewed_at, operator_review_status, order_items(id, product_id, title, sku, quantity, unit_price, line_total, image_url)";

async function findOrder(term: string): Promise<{ id: string } | null> {
  const t = term.trim();
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 9) {
    const { data } = await supabase.from("orders").select("id").ilike("customer_phone", `%${digits.slice(-9)}%`)
      .order("created_at", { ascending: false }).limit(1);
    return (data?.[0] as any) ?? null;
  }
  const { data } = await supabase.from("orders").select("id").eq("public_order_number", t.replace(/^#/, "")).limit(1);
  return (data?.[0] as any) ?? null;
}

export default function AdminCallQueue() {
  const access = useCallQueueAccess();
  if (!access.loaded) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!access.allowed && !access.isManager) return <Navigate to="/admin/orders" replace />;
  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-3">
      {access.testMode && (
        <div className="rounded-lg border-2 border-yellow-400 bg-yellow-100 text-yellow-900 px-3 py-2 text-sm font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Test mode — actions here are real.
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-extrabold">Call Queue · ზარების რიგი</h1>
        <ToggleStore compact />
      </div>
      <Tabs defaultValue={access.allowed ? "queue" : "team"}>
        <TabsList>
          {access.allowed && <TabsTrigger value="queue">რიგი / Queue</TabsTrigger>}
          {access.isManager && <TabsTrigger value="team">Team</TabsTrigger>}
        </TabsList>
        {access.allowed && <TabsContent value="queue"><QueueTab /></TabsContent>}
        {access.isManager && <TabsContent value="team"><TeamTab operators={access.settings?.enabled_operators ?? []} /></TabsContent>}
      </Tabs>
    </div>
  );
}

// ───────────────────────── Operator queue ─────────────────────────
function QueueTab() {
  const { user } = useAdminAuth();
  const actor = user?.email || "admin";
  const { activeStore } = useStore();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [order, setOrder] = useState<QOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [restoreStock, setRestoreStock] = useState(true);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [today, setToday] = useState({ count: 0, sum: 0 });
  const [shift, setShift] = useState<{ id: string; paused: boolean } | null>(null);
  const [search, setSearch] = useState("");

  const loadToday = useCallback(async () => {
    const { data } = await supabase.from("order_events").select("order_id")
      .eq("actor", actor).eq("event_type", "call_outcome").eq("payload->>outcome", "confirmed")
      .gte("created_at", tbilisiStartOfDay(new Date()).toISOString()).limit(1000);
    const ids = [...new Set(((data as any[]) || []).map((r) => r.order_id))];
    if (ids.length === 0) { setToday({ count: 0, sum: 0 }); return; }
    const { data: os } = await supabase.from("orders").select("total").in("id", ids).eq("is_confirmed", true);
    setToday({ count: ids.length, sum: ((os as any[]) || []).reduce((s, o) => s + Number(o.total || 0), 0) });
  }, [actor]);

  const loadShift = useCallback(async () => {
    const { data } = await (supabase as any).from("operator_shifts").select("id, paused")
      .eq("operator", actor).is("ended_at", null).order("started_at", { ascending: false }).limit(1);
    setShift(data?.[0] ?? null);
  }, [actor]);

  useEffect(() => { void loadToday(); void loadShift(); }, [loadToday, loadShift]);
  useEffect(() => () => { void endSession("unmounted"); if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const fetchOrder = useCallback(async (id: string) => {
    const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
    return data as unknown as QOrder | null;
  }, []);

  const loadNext = useCallback(async () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setIdle(false);
    setLoading(true);
    setEmpty(false);
    try {
      const res = await queueNext(activeStore);
      if (!res.order_id) { setOrder(null); setEmpty(true); return; }
      const o = await fetchOrder(res.order_id);
      setOrder(o);
      if (o) {
        // Same as OrderQuickReviewModal on open
        supabase.from("order_events").insert({ order_id: o.id, actor, event_type: "order_opened", payload: {} as any });
        void startSession(o.id, actor);
        if (!o.operator_viewed_at) {
          supabase.from("orders").update({
            operator_viewed_at: new Date().toISOString(), operator_viewed_by: actor,
            operator_review_status: o.operator_review_status || "viewed",
          } as any).eq("id", o.id).then(() => {});
        }
      }
    } catch (e: any) {
      toast({ title: "რიგი ვერ ჩაიტვირთა", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeStore, actor, fetchOrder, toast]);

  const reload = useCallback(async () => { if (order) setOrder(await fetchOrder(order.id)); }, [order, fetchOrder]);

  /** After any action: release lock (also sets queue_last_touched_by) and load the next order. */
  const finish = async (id: string, outcome: string) => {
    void endSession("outcome", outcome);
    try { await queueRelease(id); } catch { /* lock will expire */ }
    setOrder(null);
    void loadToday();
    await loadNext();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };

  const onConfirm = async () => {
    if (!order) return;
    const addr = order.normalized_address || order.address_line1 || "";
    if (isTbilisiCity(order.normalized_city || order.city || "") && !splitDistrict(addr).district.trim()) {
      toast({ title: "მიუთითეთ რაიონი", description: "თბილისის შეკვეთისთვის რაიონი სავალდებულოა.", variant: "destructive" });
      return;
    }
    setBusy(true);
    const ok = await confirmOrderFromQueue(order, actor, currentSessionId());
    setBusy(false);
    if (!ok) { toast({ title: "ვერ შეინახა", variant: "destructive" }); return; }
    toast({ title: "დადასტურდა ✓" });
    await finish(order.id, "confirmed");
  };

  const onNoAnswer = async () => {
    if (!order) return;
    setBusy(true);
    try {
      const sid = currentSessionId();
      const rec = await recordNoAnswerAttempt(order.id, actor, "call_queue", sid);
      if (!rec) throw new Error("save failed");
      markAction("call_attempt");
      const r = await queueScheduleRetry(order.id);
      if (r.action === "cancel") {
        const ok = await cancelOrderWithReason(order.id, actor, "no_answer_after_attempts", null, r.attempt_count, r.max_attempts, "call_queue", sid);
        if (ok) await applyOrderCancelStock(order.id, true);
        toast({ title: ok ? "გაუქმდა — არ პასუხობს" : "გაუქმება ვერ მოხერხდა", variant: ok ? undefined : "destructive" });
        await finish(order.id, ok ? "cancelled" : "no_answer");
      } else {
        toast({ title: "შენახულია — მოგვიანებით დაირეკება" });
        await finish(order.id, "no_answer");
      }
    } catch (e: any) {
      toast({ title: "ვერ შეინახა", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const onCallback = async (whenIso: string) => {
    if (!order) return;
    setBusy(true);
    const ok = await scheduleCallback(order.id, actor, whenIso, "call_queue", currentSessionId());
    setBusy(false);
    if (!ok) { toast({ title: "გადარეკვის შენახვა ვერ მოხერხდა", variant: "destructive" }); return; }
    markAction("callback");
    setCallbackOpen(false);
    toast({ title: "გადარეკვა დანიშნულია" });
    await finish(order.id, "callback");
  };

  const onCancel = async (reason: CancelReason, note: string | null) => {
    if (!order) return;
    setBusy(true);
    const ok = await cancelOrderWithReason(order.id, actor, reason, note, Number(order.call_attempt_count || 0), undefined, "call_queue", currentSessionId());
    if (ok) await applyOrderCancelStock(order.id, restoreStock);
    setBusy(false);
    if (!ok) { toast({ title: "გაუქმება ვერ მოხერხდა", variant: "destructive" }); return; }
    markAction("cancel");
    setCancelOpen(false);
    toast({ title: "შეკვეთა გაუქმდა" });
    await finish(order.id, "cancelled");
  };

  // Item edits — same writes as OrderQuickReviewModal
  const refreshTotals = async () => {
    if (!order) return;
    const { data: items } = await supabase.from("order_items").select("line_total").eq("order_id", order.id);
    const sub = ((items as any[]) || []).reduce((s, i) => s + Number(i.line_total), 0);
    const total = sub + Number(order.shipping_fee || 0) - Number(order.discount_total || 0);
    await supabase.from("orders").update({ subtotal: sub, total }).eq("id", order.id);
    await reload();
  };
  const changeQty = async (item: QItem, next: number) => {
    if (!order || next < 1) return;
    let base = Number(item.unit_price);
    const { data: prod } = await supabase.from("products").select("price").eq("sku", item.sku).limit(1).maybeSingle();
    if (prod?.price != null) base = Number(prod.price);
    const { error } = await supabase.from("order_items").update({
      quantity: next, line_total: getTieredLineTotal(base, next, item.sku), unit_price: getTieredUnitPrice(base, next, item.sku),
    }).eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({ order_id: order.id, actor, event_type: "item_quantity_change",
      payload: { item_id: item.id, sku: item.sku, from: item.quantity, to: next } as any });
    markAction("item_quantity_change");
    await refreshTotals();
  };
  const removeItem = async (item: QItem) => {
    if (!order || !confirm(`${item.title} — წავშალო შეკვეთიდან?`)) return;
    const { error } = await supabase.from("order_items").delete().eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({ order_id: order.id, actor, event_type: "item_removed",
      payload: { item_id: item.id, sku: item.sku, title: item.title } as any });
    markAction("item_removed");
    await refreshTotals();
  };

  const shiftAction = async (a: "start" | "pause" | "end") => {
    const db = supabase as any;
    if (a === "start") await db.from("operator_shifts").insert({ operator: actor });
    else if (shift && a === "pause") await db.from("operator_shifts").update({ paused: !shift.paused, updated_at: new Date().toISOString() }).eq("id", shift.id);
    else if (shift) await db.from("operator_shifts").update({ ended_at: new Date().toISOString(), paused: false, updated_at: new Date().toISOString() }).eq("id", shift.id);
    await loadShift();
  };

  const doSearch = async () => {
    const found = await findOrder(search);
    if (found) navigate(`/admin/orders/${found.id}`);
    else toast({ title: "შეკვეთა ვერ მოიძებნა" });
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        {!shift ? (
          <Button size="sm" onClick={() => shiftAction("start")} className="gap-1"><Play className="w-4 h-4" /> ცვლის დაწყება / Start shift</Button>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={() => shiftAction("pause")} className="gap-1">
              {shift.paused ? <><Play className="w-4 h-4" /> გაგრძელება / Resume</> : <><Pause className="w-4 h-4" /> პაუზა / Pause</>}
            </Button>
            <Button size="sm" variant="outline" onClick={() => shiftAction("end")} className="gap-1"><Square className="w-4 h-4" /> დასრულება / End shift</Button>
          </>
        )}
        <span className="ml-auto text-sm font-bold">დღეს: {today.count} დადასტურებული · {today.sum.toFixed(2)} ₾</span>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void doSearch(); }}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ტელეფონი ან შეკვეთის # / phone or order #" className="text-base" />
        <Button type="submit" variant="outline" size="icon"><Search className="w-4 h-4" /></Button>
      </form>

      {!order && (
        <div className="space-y-2">
          {idle && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-center">მზად ხარ შემდეგისთვის? / Ready for the next one?</div>}
          {empty && !loading && <div className="text-center text-sm text-muted-foreground py-2">რიგი ცარიელია / Queue is empty</div>}
          <Button onClick={loadNext} disabled={loading} className="w-full h-16 text-lg font-extrabold">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "შემდეგი შეკვეთა / Next order"}
          </Button>
        </div>
      )}

      {order && (
        <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-xs text-muted-foreground">#{order.public_order_number}</div>
              <div className="text-lg font-extrabold">{order.customer_name}</div>
              <div className="text-sm">{order.customer_phone}</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-extrabold">{Number(order.total).toFixed(2)} ₾</div>
            </div>
          </div>
          <CallButton orderId={order.id} phone={order.customer_phone} customerName={order.customer_name} className="w-full h-12 text-base" />

          {(order.notes_customer || order.internal_note) && (
            <div className="space-y-1 text-sm">
              {order.notes_customer && <div className="rounded-md bg-muted px-2 py-1.5"><b>კლიენტის შენიშვნა:</b> {order.notes_customer}</div>}
              {order.internal_note && <div className="rounded-md bg-muted px-2 py-1.5"><b>შენიშვნა:</b> {order.internal_note}</div>}
            </div>
          )}

          <EditableOrderFields key={order.id} orderId={order.id} order={order} actor={actor} onSaved={reload} />

          <div className="space-y-2">
            {order.order_items.map((it) => (
              <div key={it.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                {it.image_url && <img src={it.image_url} alt="" className="w-12 h-12 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{it.title}</div>
                  <div className="text-xs text-muted-foreground">{it.sku} · {Number(it.line_total).toFixed(2)} ₾</div>
                </div>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(it, it.quantity - 1)} disabled={it.quantity <= 1}><Minus className="w-3 h-3" /></Button>
                <span className="w-6 text-center font-bold">{it.quantity}</span>
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => changeQty(it, it.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                {order.order_items.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removeItem(it)}><Trash2 className="w-3 h-3" /></Button>
                )}
              </div>
            ))}
            <LandingQtyDiscountActions orderId={order.id} actor={actor} disabled={busy}
              items={order.order_items.map((i) => ({ id: i.id, sku: i.sku, title: i.title, quantity: i.quantity, unit_price: i.unit_price, line_total: i.line_total }))}
              onApplied={reload} />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button disabled={busy} onClick={onConfirm} className="h-14 text-base font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-1"><CheckCircle2 className="w-5 h-5" /> დადასტურდა</Button>
            <Button disabled={busy} onClick={onNoAnswer} variant="outline" className="h-14 text-base font-extrabold border-amber-400 text-amber-800 gap-1"><PhoneOff className="w-5 h-5" /> არ პასუხობს</Button>
            <Button disabled={busy} onClick={() => setCallbackOpen(true)} variant="outline" className="h-14 text-base font-extrabold border-blue-400 text-blue-800 gap-1"><RotateCcw className="w-5 h-5" /> გადასარეკია</Button>
            <Button disabled={busy} onClick={() => setCancelOpen(true)} variant="outline" className="h-14 text-base font-extrabold border-red-400 text-red-700 gap-1"><XCircle className="w-5 h-5" /> გაუქმდა</Button>
          </div>
        </div>
      )}

      <CancelReasonModal
        open={cancelOpen} orderNumber={order?.public_order_number} callAttemptCount={Number(order?.call_attempt_count || 0)}
        submitting={busy} onCancel={() => setCancelOpen(false)} onConfirm={onCancel}
        restoreStock={restoreStock} onRestoreStockChange={setRestoreStock}
        hiddenReasons={["no_answer_after_attempts"]} minOtherNoteLength={5}
      />
      <CallbackPickerModal open={callbackOpen} submitting={busy} onCancel={() => setCallbackOpen(false)} onConfirm={onCallback} />
    </div>
  );
}

// ───────────────────────── Manager view ─────────────────────────
function TeamTab({ operators }: { operators: string[] }) {
  const { activeStore } = useStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [locks, setLocks] = useState<{ order_id: string; order_number: string; locked_by: string; locked_until: string }[]>([]);
  const [shifts, setShifts] = useState<{ operator: string; started_at: string; ended_at: string | null; paused: boolean }[]>([]);
  const [assignTerm, setAssignTerm] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [overrideTerm, setOverrideTerm] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, l, sh] = await Promise.all([
        queueStats(activeStore), queueTeamLocks(),
        (supabase as any).from("operator_shifts").select("operator, started_at, ended_at, paused")
          .gte("started_at", new Date(Date.now() - 24 * 3600e3).toISOString()).order("started_at", { ascending: false }),
      ]);
      setStats(s); setLocks(l || []);
      const latest = new Map<string, any>();
      for (const r of sh.data || []) if (!latest.has(r.operator.toLowerCase())) latest.set(r.operator.toLowerCase(), r);
      setShifts([...latest.values()]);
    } catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
  }, [activeStore, toast]);

  useEffect(() => { void load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const people = [...new Set([...operators, ...shifts.map((s) => s.operator)].map((e) => e.toLowerCase()))];
  const nowTb = new Date(Date.now() + 4 * 3600e3);
  const hour = nowTb.getUTCHours();
  const inHours = hour >= 10 && hour < 21;
  const oldestMin = stats?.oldest_fresh_seconds != null ? Math.round(stats.oldest_fresh_seconds / 60) : null;

  const doAssign = async () => {
    const o = await findOrder(assignTerm);
    if (!o || !assignTo) { toast({ title: "შეკვეთა ან ოპერატორი არ არის" }); return; }
    try { await queueAssign(o.id, assignTo); toast({ title: "მიენიჭა" }); setAssignTerm(""); void load(); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  const doOverride = async () => {
    const o = await findOrder(overrideTerm);
    if (!o) { toast({ title: "შეკვეთა ვერ მოიძებნა" }); return; }
    try { await queueOverride(o.id); toast({ title: "კიდევ ერთი ცდა დაშვებულია" }); setOverrideTerm(""); void load(); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-3 mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {[
          ["ახალი / Fresh waiting", stats?.fresh_waiting],
          ["გადარეკვა / Callbacks due", stats?.callbacks_due],
          ["განმეორება / Retries due", stats?.retries_due],
          ["დღეს მოგვიანებით / Later today", stats?.retries_later_today],
          ["ხვალ / Tomorrow", stats?.retries_tomorrow],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-lg border border-border bg-card p-2">
            <div className="text-[11px] text-muted-foreground">{l}</div>
            <div className="text-xl font-extrabold">{v ?? "—"}</div>
          </div>
        ))}
        <div className={`rounded-lg border p-2 ${inHours && oldestMin != null && oldestMin > 15 ? "border-red-500 bg-red-50 text-red-800" : "border-border bg-card"}`}>
          <div className="text-[11px]">ყველაზე ძველი ახალი / Oldest fresh</div>
          <div className="text-xl font-extrabold">{oldestMin == null ? "—" : `${oldestMin} წთ`}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="text-sm font-bold">ოპერატორები / Operators</div>
        {people.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
        {people.map((p) => {
          const s = shifts.find((x) => x.operator.toLowerCase() === p);
          const state = !s || s.ended_at ? "offline" : s.paused ? "paused" : "on shift";
          const held = locks.filter((l) => (l.locked_by || "").toLowerCase() === p);
          return (
            <div key={p} className="flex flex-wrap items-center gap-2 text-sm border-t border-border pt-2 first:border-0 first:pt-0">
              <span className={`w-2 h-2 rounded-full ${state === "on shift" ? "bg-emerald-500" : state === "paused" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
              <span className="font-semibold truncate">{p}</span>
              <span className="text-xs text-muted-foreground">{state}</span>
              {held.map((l) => (
                <span key={l.order_id} className="ml-auto flex items-center gap-1 text-xs">
                  #{l.order_number}
                  <Button size="sm" variant="ghost" className="h-6 px-2" onClick={async () => { await queueForceRelease(l.order_id); void load(); }}>release</Button>
                </span>
              ))}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="text-sm font-bold">მინიჭება / Assign order</div>
        <Input value={assignTerm} onChange={(e) => setAssignTerm(e.target.value)} placeholder="შეკვეთის # ან ტელეფონი" className="text-base" />
        <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-2 text-base">
          <option value="">— ოპერატორი —</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <Button size="sm" onClick={doAssign}>მინიჭება / Assign (30 min)</Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="text-sm font-bold">კიდევ ერთი ცდა / Allow one more attempt</div>
        <Input value={overrideTerm} onChange={(e) => setOverrideTerm(e.target.value)} placeholder="შეკვეთის # ან ტელეფონი" className="text-base" />
        <Button size="sm" variant="outline" onClick={doOverride}>დაშვება / Allow</Button>
      </div>
    </div>
  );
}
