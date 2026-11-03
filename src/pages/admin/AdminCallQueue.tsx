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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2, CheckCircle2, PhoneOff, RotateCcw, XCircle, Search, Play, Pause, Square, AlertTriangle, Undo2,
} from "lucide-react";
import CallButton from "@/components/admin/CallButton";
import AddressFields, { useAddressFields } from "@/components/admin/order-review/AddressFields";
import OrderItemsEditor from "@/components/admin/order-review/OrderItemsEditor";
import PreviousOrdersPanel from "@/components/admin/order-review/PreviousOrdersPanel";
import { persistOrderEdits } from "@/components/admin/order-review/persistOrderEdits";
import CreateReturnModal from "@/components/admin/CreateReturnModal";
import CancelReasonModal from "@/components/admin/CancelReasonModal";
import CallbackPickerModal from "@/components/admin/CallbackPickerModal";
import ToggleStore from "@/components/admin/ToggleStore";
import { startSession, endSession, markAction, currentSessionId } from "@/lib/operatorSession";
import { recordNoAnswerAttempt, cancelOrderWithReason, scheduleCallback } from "@/lib/callAttemptService";
import { applyOrderCancelStock } from "@/lib/stockService";
import { tbilisiStartOfDay, TBILISI_OFFSET_MS } from "@/lib/tbilisiTime";
import { isOutsideWorkHours } from "@/lib/callQueuePolicy";
import type { CancelReason } from "@/lib/cancelReasons";
import {
  queueNext, queueRelease, queueScheduleRetry, queueStats, queueTeamLocks, queueAssign,
  queueForceRelease, queueOverride, confirmOrderFromQueue, queueUndo,
  fetchUndoSnapshotSource, fetchUndoState, fetchActionEventIds, queueShiftStart, queueAutoEndShifts, type QueueStats,
} from "@/lib/callQueueService";
import {
  buildSnapshot, canUndo, UNDO_WINDOW_MS, UNDOABLE_EVENT_TYPES, OUTCOME_LABEL,
  SNAPSHOT_BACKDATE_MS, undoBarDeadlineMs, undoBarFraction,
  type UndoAction, type QueueOutcome, type UndoCheck,

} from "@/lib/callQueueUndo";
import { buildTeamRows, idleLevel, type TeamRow } from "@/lib/callQueueTeamMetrics";

const IDLE_MS = 3 * 60 * 1000;

interface QItem { id: string; product_id: string | null; title: string; sku: string; quantity: number; unit_price: number; line_total: number; image_url: string }
interface QOrder {
  id: string; public_order_number: string; created_at: string; status: string;
  customer_name: string; customer_phone: string; city: string; raw_city: string | null; normalized_city: string | null;
  address_line1: string; address_line2: string | null; raw_address: string | null; normalized_address: string | null;
  notes_customer: string | null; internal_note: string | null; normalization_confidence: number | null; review_required: boolean;
  subtotal: number; shipping_fee: number; discount_total: number; total: number;
  call_attempt_count: number | null; is_fulfilled: boolean | null; operator_viewed_at: string | null; operator_review_status: string | null;
  order_items: QItem[];
}
const ORDER_SELECT =
  "id, public_order_number, created_at, status, customer_name, customer_phone, city, raw_city, normalized_city, address_line1, address_line2, raw_address, normalized_address, notes_customer, internal_note, normalization_confidence, review_required, subtotal, shipping_fee, discount_total, total, call_attempt_count, is_fulfilled, operator_viewed_at, operator_review_status, order_items(id, product_id, title, sku, quantity, unit_price, line_total, image_url)";

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

const fmtDur = (sec: number) => {
  const m = Math.floor(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
const tbClock = (iso: string) => {
  const d = new Date(new Date(iso).getTime() + TBILISI_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const isTypingTarget = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
};

export default function AdminCallQueue() {
  const access = useCallQueueAccess();
  if (!access.loaded) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!access.allowed && !access.isManager) return <Navigate to="/admin/orders" replace />;
  return (
    <div className="p-3 sm:p-6 max-w-2xl lg:max-w-6xl mx-auto space-y-3">
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
        {access.isManager && (
          <TabsContent value="team">
            <TeamTab lockMinutes={access.settings?.lock_minutes ?? 10} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

// ───────────────────────── Operator queue ─────────────────────────
interface ShiftState { id: string; paused: boolean; started_at: string; updated_at: string | null }

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
  const [shift, setShift] = useState<ShiftState | null>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftLoaded, setShiftLoaded] = useState(false);
  const { settings: queueCfg } = useCallQueueAccess();
  const [endedSummary, setEndedSummary] = useState<{ calls: number } | null>(null);
  const [yesterday, setYesterday] = useState<{ count: number; sum: number } | null>(null);
  const [pendingShift, setPendingShift] = useState<"pause" | "end" | null>(null);
  const [search, setSearch] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [lastAction, setLastAction] = useState<UndoAction | null>(null);
  const [undoCheck, setUndoCheck] = useState<UndoCheck>({ ok: false, reason: "Nothing to undo" });
  const [undoing, setUndoing] = useState(false);
  const addr = useAddressFields();

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  /** Save address edits with the pop-up's diff rules; runs before every outcome. */
  const saveEdits = async (): Promise<boolean> => {
    if (!order) return false;
    const updates = addr.collectUpdates(order);
    if (Object.keys(updates).length === 0) return true;
    const res = await persistOrderEdits(order.id, updates, actor);
    if (!res.ok) { toast({ title: "შენახვა ვერ მოხერხდა", description: res.error, variant: "destructive" }); return false; }
    setOrder({ ...order, ...(updates as Partial<QOrder>) });
    return true;
  };

  const loadToday = useCallback(async () => {
    const { data } = await supabase.from("order_events").select("order_id")
      .eq("actor", actor).eq("event_type", "call_outcome").eq("payload->>outcome", "confirmed")
      .gte("created_at", tbilisiStartOfDay(new Date()).toISOString()).limit(1000);
    const ids = [...new Set(((data as any[]) || []).map((r) => r.order_id))];
    if (ids.length === 0) { setToday({ count: 0, sum: 0 }); return; }
    const { data: os } = await supabase.from("orders").select("total").in("id", ids).eq("is_confirmed", true);
    setToday({ count: (os as any[])?.length ?? 0, sum: ((os as any[]) || []).reduce((s, o) => s + Number(o.total || 0), 0) });
  }, [actor]);

  const loadYesterday = useCallback(async () => {
    const end = tbilisiStartOfDay(new Date());
    const start = new Date(end.getTime() - 86400e3);
    const { data } = await supabase.from("order_events").select("order_id")
      .eq("actor", actor).eq("event_type", "call_outcome").eq("payload->>outcome", "confirmed")
      .gte("created_at", start.toISOString()).lt("created_at", end.toISOString()).limit(1000);
    const ids = [...new Set(((data as any[]) || []).map((r) => r.order_id))];
    if (!ids.length) { setYesterday({ count: 0, sum: 0 }); return; }
    const { data: os } = await supabase.from("orders").select("total").in("id", ids).eq("is_confirmed", true);
    setYesterday({ count: (os as any[])?.length ?? 0, sum: ((os as any[]) || []).reduce((s, o) => s + Number(o.total || 0), 0) });
  }, [actor]);

  const loadShift = useCallback(async () => {
    try { await queueAutoEndShifts(); } catch { /* best effort */ }
    const { data, error } = await (supabase as any).from("operator_shifts").select("id, paused, started_at, updated_at")
      .eq("operator", actor).is("ended_at", null).order("started_at", { ascending: false }).limit(1);
    if (error) { toast({ title: "ცვლა ვერ ჩაიტვირთა / Shift load failed", description: error.message, variant: "destructive" }); return undefined; }
    setShift(data?.[0] ?? null);
    setShiftLoaded(true);
    return (data?.[0] ?? null) as ShiftState | null;
  }, [actor, toast]);

  useEffect(() => { void loadToday(); void loadShift(); void loadYesterday(); }, [loadToday, loadShift, loadYesterday]);
  useEffect(() => () => { void endSession("unmounted"); if (idleTimer.current) clearTimeout(idleTimer.current); }, []);

  const fetchOrder = useCallback(async (id: string) => {
    const { data } = await supabase.from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
    return data as unknown as QOrder | null;
  }, []);

  const openOrder = useCallback(async (id: string) => {
    const o = await fetchOrder(id);
    setOrder(o);
    if (!o) return;
    addr.reset(o);
    // Same as OrderQuickReviewModal on open
    supabase.from("order_events").insert({ order_id: o.id, actor, event_type: "order_opened", payload: {} as any });
    void startSession(o.id, actor);
    if (!o.operator_viewed_at) {
      supabase.from("orders").update({
        operator_viewed_at: new Date().toISOString(), operator_viewed_by: actor,
        operator_review_status: o.operator_review_status || "viewed",
      } as any).eq("id", o.id).then(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor, fetchOrder]);

  const loadNext = useCallback(async () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setIdle(false);
    setLoading(true);
    setEmpty(false);
    try {
      const res = await queueNext(activeStore);
      if (res.error) {
        setOrder(null);
        toast({ title: res.error === "paused" ? "ცვლა პაუზაზეა / Shift is paused" : "ჯერ დაიწყეთ ცვლა / Start your shift first", variant: "destructive" });
        void loadShift();
        return;
      }
      if (!res.order_id) { setOrder(null); setEmpty(true); return; }
      await openOrder(res.order_id);
    } catch (e: any) {
      toast({ title: "რიგი ვერ ჩაიტვირთა", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [activeStore, openOrder, toast, loadShift]);

  // ── Undo bookkeeping ──
  /** Snapshot the fields undo restores. Start time is backdated slightly to tolerate clock skew. */
  const takeSnapshot = async (outcome: QueueOutcome): Promise<UndoAction | null> => {
    if (!order) return null;
    const src = await fetchUndoSnapshotSource(order.id);
    if (!src) return null;
    const takenAt = new Date(Date.now() - SNAPSHOT_BACKDATE_MS).toISOString();
    return { orderId: order.id, orderNumber: order.public_order_number, outcome, actor, takenAt, snapshot: buildSnapshot(src, outcome, actor, takenAt) };
  };

  const refreshUndo = useCallback(async (a: UndoAction | null) => {
    if (!a) { setUndoCheck({ ok: false, reason: "Nothing to undo" }); return; }
    const pre = canUndo(a, actor, { status: null, is_fulfilled: false, onway_sent_at: null, onway_tracking: null, packed_at: null, packing_wave_id: null, touchedByOther: false });
    if (!pre.ok) { setUndoCheck(pre); return; }
    const st = await fetchUndoState(a.orderId, actor, a.takenAt);
    setUndoCheck(canUndo(a, actor, st as any));
  }, [actor]);

  useEffect(() => { void refreshUndo(lastAction); }, [lastAction, now, refreshUndo]);
  // Expire exactly at the 5-minute mark.
  useEffect(() => {
    if (!lastAction) return;
    const ms = new Date(lastAction.takenAt).getTime() + UNDO_WINDOW_MS - Date.now();
    const t = setTimeout(() => setNow(Date.now()), Math.max(0, ms + 50));
    return () => clearTimeout(t);
  }, [lastAction]);

  // The bottom bar ticks fast enough for its countdown line to move smoothly.
  const barDeadline = lastAction ? undoBarDeadlineMs(lastAction.takenAt) : 0;
  const [barNow, setBarNow] = useState(Date.now());
  useEffect(() => {
    if (!lastAction) return;
    setBarNow(Date.now());
    if (Date.now() >= barDeadline) return;
    const t = setInterval(() => {
      const n = Date.now();
      setBarNow(n);
      if (n >= barDeadline) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [lastAction, barDeadline]);
  const barRemaining = Math.max(0, barDeadline - barNow);


  /** After any action: release lock (also sets queue_last_touched_by) and load the next order. */
  const finish = async (id: string, outcome: string, action: UndoAction | null) => {
    void endSession("outcome", outcome);
    try { await queueRelease(id); } catch { /* lock will expire */ }
    setOrder(null);
    if (action) setLastAction(action);
    void loadToday();
    await loadNext();
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };

  const onConfirm = async () => {
    if (!order || busy) return;
    const v = addr.validateForConfirm();
    if (!v.ok) { toast({ title: "მიუთითეთ მისამართი", description: v.message, variant: "destructive" }); return; }
    setBusy(true);
    if (!(await saveEdits())) { setBusy(false); return; }
    const snap = await takeSnapshot("confirmed");
    const ok = await confirmOrderFromQueue(order, actor, currentSessionId());
    setBusy(false);
    if (!ok) { toast({ title: "ვერ შეინახა", variant: "destructive" }); return; }
    await finish(order.id, "confirmed", snap);
  };

  const onNoAnswer = async () => {
    if (!order || busy) return;
    setBusy(true);
    if (!(await saveEdits())) { setBusy(false); return; }
    try {
      const snap = await takeSnapshot("no_answer");
      const sid = currentSessionId();
      const rec = await recordNoAnswerAttempt(order.id, actor, "call_queue", sid);
      if (!rec) throw new Error("save failed");
      markAction("call_attempt");
      const r = await queueScheduleRetry(order.id);
      if (r.action === "cancel") {
        const ok = await cancelOrderWithReason(order.id, actor, "no_answer_after_attempts", null, r.attempt_count, r.max_attempts, "call_queue", sid);
        if (ok) await applyOrderCancelStock(order.id, true);
        if (!ok) toast({ title: "გაუქმება ვერ მოხერხდა", variant: "destructive" });
        await finish(order.id, ok ? "cancelled" : "no_answer", snap ? { ...snap, outcome: ok ? "cancelled" : "no_answer" } : null);
      } else {
        await finish(order.id, "no_answer", snap);
      }
    } catch (e: any) {
      toast({ title: "ვერ შეინახა", description: e.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const onCallback = async (whenIso: string) => {
    if (!order) return;
    setBusy(true);
    if (!(await saveEdits())) { setBusy(false); return; }
    const snap = await takeSnapshot("callback");
    const ok = await scheduleCallback(order.id, actor, whenIso, "call_queue", currentSessionId());
    setBusy(false);
    if (!ok) { toast({ title: "გადარეკვის შენახვა ვერ მოხერხდა", variant: "destructive" }); return; }
    markAction("callback");
    setCallbackOpen(false);
    await finish(order.id, "callback", snap);
  };

  const onCancel = async (reason: CancelReason, note: string | null) => {
    if (!order) return;
    setBusy(true);
    if (!(await saveEdits())) { setBusy(false); return; }
    const snap = await takeSnapshot("cancelled");
    const ok = await cancelOrderWithReason(order.id, actor, reason, note, Number(order.call_attempt_count || 0), undefined, "call_queue", currentSessionId());
    if (ok) await applyOrderCancelStock(order.id, restoreStock);
    setBusy(false);
    if (!ok) { toast({ title: "გაუქმება ვერ მოხერხდა", variant: "destructive" }); return; }
    markAction("cancel");
    setCancelOpen(false);
    await finish(order.id, "cancelled", snap);
  };

  const doUndo = async () => {
    const a = lastAction;
    if (!a || undoing) return;
    setUndoing(true);
    try {
      const st = await fetchUndoState(a.orderId, actor, a.takenAt);
      const chk = canUndo(a, actor, st as any);
      if (!chk.ok) { setUndoCheck(chk); toast({ title: "Undo not possible", description: chk.reason, variant: "destructive" }); return; }
      const ids = await fetchActionEventIds(a.orderId, actor, a.takenAt, UNDOABLE_EVENT_TYPES);
      // Leave the currently open order first; undo re-locks the undone one to me.
      if (order && order.id !== a.orderId) {
        void endSession("undo");
        try { await queueRelease(order.id); } catch { /* expires */ }
      }
      const res = await queueUndo(a.orderId, a.snapshot, ids);
      setLastAction(null);
      toast({
        title: `გაუქმდა: ${OUTCOME_LABEL[a.outcome]} · #${a.orderNumber}`,
        description: res.sms_already_sent ? "SMS was already sent to the customer." : undefined,
      });
      void loadToday();
      await openOrder(a.orderId);
    } catch (e: any) {
      toast({ title: "Undo failed", description: e.message, variant: "destructive" });
    } finally { setUndoing(false); }
  };

  const runShift = async (a: "start" | "pause" | "end") => {
    const db = supabase as any;
    setShiftBusy(true);
    let started = false;
    try {
      const ts = new Date().toISOString();
      if (a === "start" || (a === "pause" && shift?.paused)) {
        await queueShiftStart(); // resumes the open shift or starts a new one
        setEndedSummary(null);
        started = true;
        const ws = queueCfg?.work_start || "10:00", we = queueCfg?.work_end || "21:00";
        if (a === "start" && isOutsideWorkHours(new Date(), { workStart: ws, workEnd: we }))
          toast({ title: `Outside working hours (${ws}–${we}) — shift started anyway` });
      } else if (shift) {
        const patch = a === "pause" ? { paused: true, updated_at: ts } : { ended_at: ts, paused: false, updated_at: ts };
        const { error } = await db.from("operator_shifts").update(patch).eq("id", shift.id);
        if (error) throw new Error(error.message);
        // Locks are released by the database on pause/end; drop the local card too.
        setOrder(null); setEmpty(false); setIdle(false);
        if (a === "end") {
          const { count } = await supabase.from("order_events").select("id", { count: "exact", head: true })
            .eq("actor", actor).eq("event_type", "call_outcome").gte("created_at", tbilisiStartOfDay(new Date()).toISOString());
          await loadToday();
          setEndedSummary({ calls: count ?? 0 });
        }
      } else throw new Error("No open shift");
    } catch (e: any) {
      toast({ title: "ცვლის ქმედება ვერ შესრულდა / Shift action failed", description: e.message, variant: "destructive" });
    } finally {
      const now = await loadShift();
      if (started && now === null) toast({ title: "ცვლა ვერ დაიწყო / Shift did not start", description: "Please try again.", variant: "destructive" });
      setShiftBusy(false);
    }
  };

  /** Pause/End while holding an order asks first. */
  const shiftAction = (a: "start" | "pause" | "end") => {
    if (a !== "start" && order && !(a === "pause" && shift?.paused)) { setPendingShift(a); return; }
    void runShift(a);
  };
  const returnAndRunShift = async () => {
    const a = pendingShift; setPendingShift(null);
    if (!a) return;
    if (order) { void endSession("returned_to_queue"); try { await queueRelease(order.id); } catch { /* trigger releases */ } setOrder(null); }
    await runShift(a);
  };

  const doSearch = async () => {
    const found = await findOrder(search);
    if (found) navigate(`/admin/orders/${found.id}`);
    else toast({ title: "შეკვეთა ვერ მოიძებნა" });
  };

  // ── Keyboard shortcuts (desktop) ──
  const keyRef = useRef<(e: KeyboardEvent) => void>();
  keyRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || cancelOpen || callbackOpen || returnOpen) return;
    if (isTypingTarget(e.target)) return;
    if (document.querySelector("[role=dialog]")) return;
    if (!shift || shift.paused) return;
    const k = e.key.toLowerCase();
    if (!order) {
      if (k === " " && !loading) { e.preventDefault(); void loadNext(); }
      else if (k === "z" && undoCheck.ok) { e.preventDefault(); void doUndo(); }
      return;
    }
    if (busy) return;
    if (k === "enter") { e.preventDefault(); void onConfirm(); }
    else if (k === "n") { e.preventDefault(); void onNoAnswer(); }
    else if (k === "c") { e.preventDefault(); setCallbackOpen(true); }
    else if (k === "x") { e.preventDefault(); setCancelOpen(true); }
    else if (k === "z" && undoCheck.ok) { e.preventDefault(); void doUndo(); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current?.(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const showUndoBar = !!lastAction && (barRemaining > 0 || undoing);
  const itemCount = order?.order_items.reduce((s, i) => s + Number(i.quantity || 0), 0) ?? 0;

  const UndoButton = ({ className = "" }: { className?: string }) => (
    <Button
      size="sm" variant="outline" disabled={!undoCheck.ok || undoing} onClick={doUndo}
      title={undoCheck.ok ? "Undo last (Z)" : undoCheck.reason} className={`gap-1 ${className}`}
    >
      {undoing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Undo2 className="w-4 h-4" />} Undo last
      <Kbd>Z</Kbd>
    </Button>
  );

  const firstName = (user?.email || "").split("@")[0];
  if (!shiftLoaded) return <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  if (!shift) {
    return (
      <div className="mt-6 max-w-md mx-auto text-center space-y-4">
        <div className="text-2xl font-extrabold">გამარჯობა, {firstName} 👋</div>
        {endedSummary ? (
          <div className="rounded-xl border border-border bg-card p-3 text-sm">
            <div className="font-bold mb-1">დღის შედეგი / Today</div>
            {endedSummary.calls} ზარი · {today.count} დადასტურებული · {today.sum.toFixed(2)} ₾
          </div>
        ) : yesterday && (
          <div className="text-sm text-muted-foreground">გუშინ: {yesterday.count} დადასტურებული · {yesterday.sum.toFixed(2)} ₾</div>
        )}
        <Button disabled={shiftBusy} onClick={() => shiftAction("start")} className="w-full h-16 text-lg font-extrabold gap-2">
          {shiftBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />} ცვლის დაწყება / Start shift
        </Button>
      </div>
    );
  }
  if (shift.paused) {
    const pausedFor = Math.max(0, (now - new Date(shift.updated_at || shift.started_at).getTime()) / 1000);
    return (
      <div className="mt-6 max-w-md mx-auto text-center space-y-4">
        <div className="text-xl font-extrabold text-amber-700">პაუზა / Paused · {fmtDur(pausedFor)}</div>
        <Button disabled={shiftBusy} onClick={() => shiftAction("pause")} className="w-full h-16 text-lg font-extrabold gap-2">
          {shiftBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />} გაგრძელება / Resume
        </Button>
        <div className="flex justify-center gap-2">
          <Button size="sm" variant="outline" disabled={shiftBusy} onClick={() => shiftAction("end")} className="gap-1"><Square className="w-4 h-4" /> დასრულება / End shift</Button>
          <UndoButton />
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-3 mt-2 ${order ? "pb-48 lg:pb-0" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2">
        <Button size="sm" variant="outline" disabled={shiftBusy} onClick={() => shiftAction("pause")} className="gap-1"><Pause className="w-4 h-4" /> პაუზა / Pause</Button>
        <Button size="sm" variant="outline" disabled={shiftBusy} onClick={() => shiftAction("end")} className="gap-1"><Square className="w-4 h-4" /> დასრულება / End shift</Button>
        <span className="text-xs font-semibold text-emerald-700">
          On shift since {tbClock(shift.started_at)} · {fmtDur(Math.max(0, (now - new Date(shift.started_at).getTime()) / 1000))}
        </span>
        <UndoButton className="ml-auto" />
        <span className="text-sm font-bold">დღეს: {today.count} დადასტურებული · {today.sum.toFixed(2)} ₾</span>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void doSearch(); }}>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ტელეფონი ან შეკვეთის # / phone or order #" className="text-base" />
        <Button type="submit" variant="outline" size="icon"><Search className="w-4 h-4" /></Button>
      </form>

      {!order && (
        <div className="space-y-2 lg:max-w-xl lg:mx-auto">
          {idle && <div className="rounded-lg bg-muted px-3 py-2 text-sm text-center">მზად ხარ შემდეგისთვის? / Ready for the next one?</div>}
          {empty && !loading && <div className="text-center text-sm text-muted-foreground py-2">რიგი ცარიელია / Queue is empty</div>}
          <Button onClick={loadNext} disabled={loading} className="w-full h-16 text-lg font-extrabold gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>შემდეგი შეკვეთა / Next order <Kbd className="hidden lg:inline-flex">Space</Kbd></>}
          </Button>
        </div>
      )}

      {order && (
        <div className="lg:grid lg:grid-cols-[65fr_35fr] lg:gap-4 lg:items-start">
          {/* Left: order form */}
          <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 space-y-3 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">#{order.public_order_number}</div>
                <div className="text-lg font-extrabold">{order.customer_name}</div>
                <div className="text-sm">{order.customer_phone}</div>
              </div>
              <div className="text-right lg:hidden">
                <div className="text-2xl font-extrabold">{Number(order.total).toFixed(2)} ₾</div>
                <div className="text-xs text-muted-foreground">{itemCount} ც</div>
              </div>
            </div>
            <PreviousOrdersPanel key={order.id} order={order} currentSkus={order.order_items.map((i) => i.sku)} actor={actor} accordion />

            {(order.notes_customer || order.internal_note) && (
              <div className="space-y-1 text-sm">
                {order.notes_customer && <div className="rounded-md bg-muted px-2 py-1.5"><b>კლიენტის შენიშვნა:</b> {order.notes_customer}</div>}
                {order.internal_note && <div className="rounded-md bg-muted px-2 py-1.5"><b>შენიშვნა:</b> {order.internal_note}</div>}
              </div>
            )}

            <AddressFields state={addr} order={order} />

            <OrderItemsEditor
              key={`items-${order.id}`}
              order={order}
              actor={actor}
              saving={busy}
              onChanged={(patch) => setOrder((o) => (o ? { ...o, ...patch } : o))}
              onCreateReturn={() => setReturnOpen(true)}
            />
          </div>

          {/* Right: sticky action panel (desktop) */}
          <aside className="hidden lg:block sticky top-20 self-start rounded-2xl border border-border bg-card p-4 space-y-3">
            <div>
              <div className="text-xs text-muted-foreground">სულ / Total · {itemCount} ც</div>
              <div className="text-3xl font-extrabold">{Number(order.total).toFixed(2)} ₾</div>
            </div>
            <CallButton orderId={order.id} phone={order.customer_phone} customerName={order.customer_name} className="w-full h-12 text-base" />
            <Button disabled={busy} onClick={onConfirm} className="w-full h-16 text-lg font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <CheckCircle2 className="w-6 h-6" /> დადასტურდა <Kbd>Enter</Kbd>
            </Button>
            <Button disabled={busy} onClick={onNoAnswer} variant="outline" className="w-full h-12 text-base font-extrabold border-amber-400 text-amber-800 gap-1">
              <PhoneOff className="w-5 h-5" /> არ პასუხობს <Kbd>N</Kbd>
            </Button>
            <Button disabled={busy} onClick={() => setCallbackOpen(true)} variant="outline" className="w-full h-12 text-base font-extrabold border-blue-400 text-blue-800 gap-1">
              <RotateCcw className="w-5 h-5" /> გადასარეკია <Kbd>C</Kbd>
            </Button>
            <Button disabled={busy} onClick={() => setCancelOpen(true)} variant="outline" className="w-full h-12 text-base font-extrabold border-red-400 text-red-700 gap-1">
              <XCircle className="w-5 h-5" /> გაუქმდა <Kbd>X</Kbd>
            </Button>
            <UndoButton className="w-full" />
          </aside>

          {/* Mobile: sticky bottom bar */}
          <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] space-y-2">
            <CallButton orderId={order.id} phone={order.customer_phone} customerName={order.customer_name} className="w-full h-11 text-base shadow-lg" />
            <Button disabled={busy} onClick={onConfirm} className="w-full h-14 text-lg font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white gap-1">
              <CheckCircle2 className="w-5 h-5" /> დადასტურდა · {Number(order.total).toFixed(2)} ₾
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button disabled={busy} onClick={onNoAnswer} variant="outline" className="h-12 text-sm font-extrabold border-amber-400 text-amber-800 px-1"><PhoneOff className="w-4 h-4" /> არ პასუხობს</Button>
              <Button disabled={busy} onClick={() => setCallbackOpen(true)} variant="outline" className="h-12 text-sm font-extrabold border-blue-400 text-blue-800 px-1"><RotateCcw className="w-4 h-4" /> გადარეკვა</Button>
              <Button disabled={busy} onClick={() => setCancelOpen(true)} variant="outline" className="h-12 text-sm font-extrabold border-red-400 text-red-700 px-1"><XCircle className="w-4 h-4" /> გაუქმდა</Button>
            </div>
          </div>
        </div>
      )}

      {showUndoBar && lastAction && (
        <div className={`fixed left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md rounded-xl border border-border bg-foreground text-background shadow-xl px-3 py-2 flex items-center gap-2 overflow-hidden ${order ? "bottom-56 lg:bottom-6" : "bottom-6"}`}>
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-semibold truncate">Saved: {OUTCOME_LABEL[lastAction.outcome]} · #{lastAction.orderNumber}</span>
          <Button size="sm" variant="secondary" className="ml-auto h-8" disabled={!undoCheck.ok || undoing} title={undoCheck.ok ? undefined : undoCheck.reason} onClick={doUndo}>
            {undoing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Undo"}
          </Button>
          <div className="absolute inset-x-0 bottom-0 h-1 bg-background/20">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${undoBarFraction(barRemaining) * 100}%` }}
            />
          </div>
        </div>
      )}


      <AlertDialog open={pendingShift !== null} onOpenChange={(o) => !o && setPendingShift(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ჯერ ეს შეკვეთა დაასრულეთ? / Finish this order first?</AlertDialogTitle>
            <AlertDialogDescription>#{order?.public_order_number} is still open.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Finish order</AlertDialogCancel>
            <AlertDialogAction onClick={() => void returnAndRunShift()}>Return it to the queue</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CancelReasonModal
        open={cancelOpen} orderNumber={order?.public_order_number} callAttemptCount={Number(order?.call_attempt_count || 0)}
        submitting={busy} onCancel={() => setCancelOpen(false)} onConfirm={onCancel}
        restoreStock={restoreStock} onRestoreStockChange={setRestoreStock}
        hiddenReasons={["no_answer_after_attempts"]} minOtherNoteLength={5}
      />
      <CallbackPickerModal open={callbackOpen} submitting={busy} onCancel={() => setCallbackOpen(false)} onConfirm={onCallback} />
      {order && (
        <CreateReturnModal
          open={returnOpen}
          orderId={order.id}
          actor={actor}
          onClose={() => setReturnOpen(false)}
          onCreated={() => toast({ title: "დაბრუნება შექმნილია ✓" })}
        />
      )}
    </div>
  );
}

function Kbd({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <kbd className={`hidden lg:inline-flex ml-1 rounded border border-current/30 px-1 text-[10px] font-mono opacity-70 ${className}`}>{children}</kbd>;
}

// ───────────────────────── Manager view ─────────────────────────
async function fetchAllRows(build: (from: number, to: number) => any, max = 20000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const BAR_COLORS = ["bg-emerald-500", "bg-blue-500", "bg-amber-500", "bg-fuchsia-500", "bg-cyan-500", "bg-rose-500", "bg-lime-500", "bg-orange-500"];

function TeamTab({ lockMinutes }: { lockMinutes: number }) {
  const { activeStore } = useStore();
  const { toast } = useToast();
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [locks, setLocks] = useState<{ order_id: string; order_number: string; locked_by: string; locked_until: string }[]>([]);
  const [rows, setRows] = useState<TeamRow[]>([]);
  const [people, setPeople] = useState<string[]>([]);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [assignTerm, setAssignTerm] = useState("");
  const [assignTo, setAssignTo] = useState("");
  const [overrideTerm, setOverrideTerm] = useState("");
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    try {
      const now = Date.now();
      const todayStart = tbilisiStartOfDay(new Date(now)).getTime();
      const todayIso = new Date(todayStart).toISOString();
      const weekIso = new Date(todayStart - 7 * 86400e3).toISOString();
      const db = supabase as any;
      try { await queueAutoEndShifts(); } catch { /* best effort */ }
      const [s, l, sh, outcomes, extra, sessions] = await Promise.all([
        queueStats(activeStore), queueTeamLocks(),
        db.from("operator_shifts").select("operator, started_at, ended_at, paused, updated_at, auto_ended")
          .gte("started_at", new Date(todayStart - 86400e3).toISOString()).order("started_at", { ascending: false }).limit(500),
        fetchAllRows((a, b) => db.from("order_events").select("id, order_id, actor, created_at, payload")
          .eq("event_type", "call_outcome").gte("created_at", weekIso).order("created_at").range(a, b)),
        fetchAllRows((a, b) => db.from("order_events").select("order_id, actor, created_at, event_type, payload")
          .in("event_type", ["item_added", "item_quantity_change", "landing_qty_discount", "outcome_undone"]).gte("created_at", todayIso).order("created_at").range(a, b)),
        fetchAllRows((a, b) => db.from("operator_order_sessions").select("order_id, operator, session_started_at, active_duration_seconds, capped_duration_seconds, had_meaningful_action")
          .gte("session_started_at", todayIso).order("session_started_at").range(a, b)),
      ]);
      if (sh.error) throw new Error(sh.error.message);
      const confirmedToday = [...new Set(outcomes.filter((e: any) => e.created_at >= todayIso && e.payload?.outcome === "confirmed").map((e: any) => e.order_id))];
      const totals = new Map<string, number>();
      for (let i = 0; i < confirmedToday.length; i += 200) {
        const { data } = await db.from("orders").select("id, total").in("id", confirmedToday.slice(i, i + 200));
        for (const o of data || []) totals.set(o.id, Number(o.total || 0));
      }
      if (reqId !== requestIdRef.current) return;
      const built = buildTeamRows({
        now, todayStart, outcomes, extraEvents: extra, sessions, shifts: sh.data || [],
        orderTotals: totals, locks: l || [], lockMinutes,
      });
      setStats(s); setLocks(l || []); setRows(built);
      // Assign only to people currently on shift (not paused).
      setPeople([...new Set(((sh.data || []) as any[]).filter((x) => !x.ended_at && !x.paused).map((x) => String(x.operator).toLowerCase()))]);
      setLoadedAt(now);
    } catch (e: any) {
      if (reqId === requestIdRef.current) toast({ title: "Load failed", description: e.message, variant: "destructive" });
    } finally {
      if (reqId === requestIdRef.current) setLoading(false);
    }
  }, [activeStore, toast, lockMinutes]);

  useEffect(() => { void load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const nowTb = new Date(Date.now() + TBILISI_OFFSET_MS);
  const hour = nowTb.getUTCHours();
  const inHours = hour >= 10 && hour < 21;
  const oldestMin = stats?.oldest_fresh_seconds != null ? Math.round(stats.oldest_fresh_seconds / 60) : null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  const doAssign = async () => {
    const o = await findOrder(assignTerm);
    if (!o || !assignTo) { toast({ title: "შეკვეთა ან ოპერატორი არ არის" }); return; }
    if (!people.includes(assignTo.toLowerCase())) { toast({ title: "ოპერატორი ცვლაზე არ არის / Operator is not on shift", variant: "destructive" }); return; }
    try { await queueAssign(o.id, assignTo); toast({ title: "მიენიჭა" }); setAssignTerm(""); void load(); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };
  const doOverride = async () => {
    const o = await findOrder(overrideTerm);
    if (!o) { toast({ title: "შეკვეთა ვერ მოიძებნა" }); return; }
    try { await queueOverride(o.id); toast({ title: "კიდევ ერთი ცდა დაშვებულია" }); setOverrideTerm(""); void load(); }
    catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); }
  };

  const hours = Array.from({ length: 13 }, (_, i) => i + 9); // 09–21
  const maxHour = Math.max(1, ...rows.flatMap((r) => hours.map((h) => r.hourly[h])));

  return (
    <div className="space-y-3 mt-2">
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[
          ["ახალი / Fresh waiting", stats?.fresh_waiting],
          ["გადარეკვა / Callbacks due", stats?.callbacks_due],
          ["განმეორება / Retries due now", stats?.retries_due],
          ["ღამის / Night leads (from 12:00)", stats?.night_waiting],
          ["მოგვიანებით / Retries later", stats ? (stats.retries_later_today ?? 0) + (stats.retries_tomorrow ?? 0) : undefined],
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

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="text-sm font-bold">ოპერატორები დღეს / Operators today</div>
          <div className="text-[11px] text-muted-foreground flex items-center gap-1">
            {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            {loadedAt ? `updated ${tbClock(new Date(loadedAt).toISOString())} · auto every 60s` : ""}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="bg-muted/60 text-muted-foreground">
              <tr>
                {["Operator", "Status", "Current order", "Calls", "Confirmed", "Cancelled", "No answer", "Conv.", "Confirmed ₾", "Upsell ₾", "Avg/order", "Orders/h", "Idle now", "Undos", "7d conf/day", "7d conv."].map((h) => (
                  <th key={h} className="p-2 text-left whitespace-nowrap font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={16} className="p-3 text-center text-muted-foreground">No operator activity today</td></tr>}
              {rows.map((r) => {
                const idl = idleLevel(r.idleSeconds);
                return (
                  <tr key={r.operator} className="border-t border-border">
                    <td className="p-2 font-semibold max-w-[180px] truncate">{r.operator}</td>
                    <td className="p-2 whitespace-nowrap">
                      <span className={`inline-block w-2 h-2 rounded-full mr-1 ${r.status === "on_shift" ? "bg-emerald-500" : r.status === "paused" ? "bg-amber-500" : "bg-muted-foreground/40"}`} />
                      {r.status === "on_shift" ? "On shift" : r.status === "paused" ? "Paused" : "Off"}
                      {r.shiftSeconds > 0 && <span className="text-muted-foreground"> · {fmtDur(r.shiftSeconds)}</span>}
                      {r.autoEnded && <span className="ml-1 rounded bg-muted px-1 text-[10px] text-muted-foreground">auto-ended</span>}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.currentOrder ? `#${r.currentOrder.number} · ${fmtDur(r.currentOrder.openSeconds)}` : "—"}</td>
                    <td className="p-2">{r.calls}</td>
                    <td className="p-2 font-bold text-emerald-700">{r.confirmed}</td>
                    <td className="p-2">{r.cancelled}</td>
                    <td className="p-2">{r.noAnswer}</td>
                    <td className="p-2 font-bold">{r.confirmed + r.cancelled ? pct(r.conversion) : "—"}</td>
                    <td className="p-2">{r.confirmedRevenue.toFixed(0)}</td>
                    <td className="p-2">{r.upsell.toFixed(0)}</td>
                    <td className="p-2">{r.avgOrderSeconds != null ? fmtDur(r.avgOrderSeconds) : "—"}</td>
                    <td className="p-2">{r.ordersPerHour != null ? r.ordersPerHour.toFixed(1) : "—"}</td>
                    <td className={`p-2 font-bold ${idl === "red" ? "text-red-600" : idl === "amber" ? "text-amber-600" : ""}`}>{r.idleSeconds != null ? fmtDur(r.idleSeconds) : "—"}</td>
                    <td className="p-2">{r.undos || "—"}</td>
                    <td className="p-2 text-muted-foreground">{r.week.confirmedPerDay.toFixed(1)}</td>
                    <td className="p-2 text-muted-foreground">{pct(r.week.conversion)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 0 && (
          <div className="p-3 border-t border-border space-y-2">
            <div className="text-xs font-semibold text-muted-foreground">Calls per hour today</div>
            <div className="flex items-end gap-1 h-28">
              {hours.map((h) => (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                  <div className="flex items-end gap-px h-24 w-full justify-center">
                    {rows.map((r, i) => (
                      <div key={r.operator} title={`${r.operator}: ${r.hourly[h]} @ ${h}:00`}
                        className={`${BAR_COLORS[i % BAR_COLORS.length]} w-full max-w-[10px] rounded-t`}
                        style={{ height: `${(r.hourly[h] / maxHour) * 100}%` }} />
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">{h}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 text-[11px]">
              {rows.map((r, i) => (
                <span key={r.operator} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-sm ${BAR_COLORS[i % BAR_COLORS.length]}`} />{r.operator}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-bold">დაკავებული შეკვეთები / Held orders</div>
          {locks.length === 0 && <div className="text-xs text-muted-foreground">—</div>}
          {locks.map((l) => (
            <div key={l.order_id} className="flex items-center gap-2 text-sm">
              <span className="font-semibold">#{l.order_number}</span>
              <span className="text-xs text-muted-foreground truncate">{l.locked_by}</span>
              <Button size="sm" variant="outline" className="ml-auto h-7 px-2"
                onClick={async () => { try { await queueForceRelease(l.order_id); void load(); } catch (e: any) { toast({ title: "Failed", description: e.message, variant: "destructive" }); } }}>
                Release
              </Button>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-bold">მინიჭება / Assign order</div>
          <Input value={assignTerm} onChange={(e) => setAssignTerm(e.target.value)} placeholder="შეკვეთის # ან ტელეფონი" className="text-base" />
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-2 text-base">
            <option value="">{people.length ? "— ოპერატორი (ცვლაზე) —" : "No one on shift"}</option>
            {people.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <Button size="sm" onClick={doAssign} className="w-full">მინიჭება / Assign (30 min)</Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <div className="text-sm font-bold">კიდევ ერთი ცდა / Allow one more attempt</div>
          <Input value={overrideTerm} onChange={(e) => setOverrideTerm(e.target.value)} placeholder="შეკვეთის # ან ტელეფონი" className="text-base" />
          <Button size="sm" variant="outline" onClick={doOverride} className="w-full">დაშვება / Allow</Button>
        </div>
      </div>
    </div>
  );
}
