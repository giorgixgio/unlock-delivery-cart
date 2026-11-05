import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { applyOrderConfirmStock, applyOrderCancelStock } from "@/lib/stockService";
import { useOutcomeLock } from "@/hooks/useOutcomeLock";
import { useDeployBusy } from "@/components/admin/NewVersionBanner";
import OutcomeLockBanner from "@/components/admin/OutcomeLockBanner";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  X, ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2,
  CheckCircle2, PhoneOff, RotateCcw, XCircle, Save, ArrowRight, ChevronDown,
  Search, Plus, Minus, Trash2, AlertTriangle, Check, GitMerge,
} from "lucide-react";
import { logSystemEvent } from "@/lib/systemEventService";
import OrderActivityLog from "@/components/admin/OrderActivityLog";
import { startSession, markAction, endSession, currentSessionId } from "@/lib/operatorSession";
import CallAttemptsPanel from "@/components/admin/CallAttemptsPanel";
import CallButton from "@/components/admin/CallButton";
import IssueFlagButton from "@/components/admin/IssueFlagButton";
import { startCallSync } from "@/lib/callSyncService";
import { toTelHref, isDesktopDevice, getOpenTelOnThisDevice } from "@/lib/callSync";
import CancelReasonModal from "@/components/admin/CancelReasonModal";
import CallbackPickerModal from "@/components/admin/CallbackPickerModal";
import {
  recordNoAnswerAttempt,
  cancelOrderWithReason,
  scheduleCallback,
  logCallOutcome,
} from "@/lib/callAttemptService";
import { DEFAULT_MAX_CALL_ATTEMPTS, type CancelReason } from "@/lib/cancelReasons";

import CreateReturnModal from "@/components/admin/CreateReturnModal";
import AddressFields, { useAddressFields } from "@/components/admin/order-review/AddressFields";
import OrderItemsEditor from "@/components/admin/order-review/OrderItemsEditor";
import PreviousOrdersPanel from "@/components/admin/order-review/PreviousOrdersPanel";
import { persistOrderEdits } from "@/components/admin/order-review/persistOrderEdits";
import { logOrderEventSafe, logConfirmBlocked } from "@/lib/orderEventLog";
import { classifyConfirmError } from "@/lib/queueSearchRules";


type Outcome = "confirmed" | "no_answer" | "callback" | "cancelled";

const OUTCOMES: {
  key: Outcome;
  label: string;
  Icon: typeof CheckCircle2;
  /** Tailwind classes for unselected (tint border + text) and selected (filled bg) states */
  unselected: string;
  selected: string;
  /** Order status this outcome maps to (undefined = no status change) */
  status?: string;
  isConfirmed?: boolean;
  reviewRequired?: boolean;
}[] = [
  { key: "confirmed", label: "დადასტურდა", Icon: CheckCircle2,
    unselected: "border-emerald-300 text-emerald-700 bg-emerald-50/60 hover:bg-emerald-100",
    selected:   "border-emerald-600 text-white bg-emerald-600 shadow-md ring-2 ring-emerald-300",
    status: "confirmed", isConfirmed: true, reviewRequired: false },
  { key: "no_answer", label: "არ პასუხობს", Icon: PhoneOff,
    unselected: "border-amber-300 text-amber-700 bg-amber-50/60 hover:bg-amber-100",
    selected:   "border-amber-600 text-white bg-amber-500 shadow-md ring-2 ring-amber-300",
    status: "on_hold" },
  { key: "callback", label: "გადასარეკია", Icon: RotateCcw,
    unselected: "border-blue-300 text-blue-700 bg-blue-50/60 hover:bg-blue-100",
    selected:   "border-blue-600 text-white bg-blue-600 shadow-md ring-2 ring-blue-300",
    status: "on_hold" },
  { key: "cancelled", label: "გაუქმდა", Icon: XCircle,
    unselected: "border-red-300 text-red-700 bg-red-50/60 hover:bg-red-100",
    selected:   "border-red-600 text-white bg-red-600 shadow-md ring-2 ring-red-300",
    status: "canceled" },
];

export const OUTCOME_LABEL: Record<string, string> = {
  ...Object.fromEntries(OUTCOMES.map((o) => [o.key, o.label])),
  wrong_number: "არასწორი ნომერი",
  duplicate: "დუბლიკატი",
};
export const OUTCOME_BADGE_CLS: Record<string, string> = {
  confirmed:    "bg-emerald-100 text-emerald-800 border-emerald-300",
  no_answer:    "bg-amber-100 text-amber-800 border-amber-300",
  callback:     "bg-blue-100 text-blue-800 border-blue-300",
  cancelled:    "bg-red-100 text-red-800 border-red-300",
  wrong_number: "bg-rose-200 text-rose-900 border-rose-400",
  duplicate:    "bg-purple-100 text-purple-800 border-purple-300",
};

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  packed: "bg-amber-100 text-amber-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  on_hold: "bg-orange-100 text-orange-800",
  merged: "bg-slate-100 text-slate-500",
  pending_bump: "bg-yellow-100 text-yellow-800",
};

interface Props {
  orderId: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
  onOrderUpdated: (orderId: string, patch: Record<string, unknown>) => void;
}

interface OrderItem {
  id: string;
  product_id: string | null;
  title: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string;
}

interface OrderFull {
  id: string;
  public_order_number: string;
  created_at: string;
  status: string;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  city: string;
  region: string;
  address_line1: string;
  address_line2: string | null;
  raw_city: string | null;
  raw_address: string | null;
  normalized_city: string | null;
  normalized_address: string | null;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  is_confirmed: boolean;
  is_fulfilled: boolean;
  is_tbilisi: boolean;
  internal_note: string | null;
  notes_customer: string | null;
  operator_review_status: string | null;
  operator_viewed_at: string | null;
  call_outcome: string | null;
  call_attempt_count: number | null;
  last_call_attempt_at: string | null;
  last_call_attempt_by: string | null;
  next_call_after: string | null;
  final_cancel_reason: string | null;
  order_items: OrderItem[];
}

interface ProductSearchResult {
  id: string;
  title: string;
  sku: string;
  price: number;
  image: string;
  available: boolean;
}


export default function OrderQuickReviewModal({
  orderId, onClose, onPrev, onNext, hasPrev, hasNext, onOrderUpdated,
}: Props) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAdminAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<OrderFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  /** Direction the panel should animate (1 = next/right, -1 = prev/left, 0 = none) */
  const [switchDir, setSwitchDir] = useState<0 | 1 | -1>(0);
  const lastIdRef = useRef<string | null>(null);

  // Simple operator fields (address lives in the shared AddressFields hook)
  const addr = useAddressFields();
  const [operatorNote, setOperatorNote] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);

  // Cancel + callback modals
  const [restoreStock, setRestoreStock] = useState(true);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPreselect, setCancelPreselect] = useState<CancelReason | null>(null);
  const [callbackOpen, setCallbackOpen] = useState(false);

  const actor = user?.email || "admin";

  // Load order whenever id changes & mark viewed
  useEffect(() => {
    if (!orderId) { lastIdRef.current = null; return; }
    // direction is already set by goPrev/goNext callers; first open = 0
    let cancelled = false;
    setLoading(true);
    addr.setAdvancedOpen(false);

    (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, public_order_number, created_at, status, payment_method, customer_name, customer_phone, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address, subtotal, shipping_fee, discount_total, total, is_confirmed, is_fulfilled, is_tbilisi, internal_note, notes_customer, operator_review_status, operator_viewed_at, call_outcome, call_attempt_count, last_call_attempt_at, last_call_attempt_by, next_call_after, final_cancel_reason, order_items(id, product_id, title, sku, quantity, unit_price, line_total, image_url)"
        )
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;
      const o = data as unknown as OrderFull | null;
      setOrder(o);
      if (o) {
        addr.reset(o);
        setOperatorNote(o.internal_note || "");

        // Always log a per-session "order_opened" event for operator stats
        void logOrderEventSafe(o.id, actor, "order_opened", { source: "quick_review" });

        // Begin a fresh operator session — switching orders ends the previous one.
        void startSession(o.id, actor);

        if (!o.operator_viewed_at) {
          const patch: Record<string, unknown> = {
            operator_viewed_at: new Date().toISOString(),
            operator_viewed_by: actor,
            operator_review_status: o.operator_review_status || "viewed",
          };
          supabase.from("orders").update(patch).eq("id", o.id).then(({ error }) => {
            if (!error) onOrderUpdated(o.id, patch);
          });
        }

        if (lastIdRef.current && lastIdRef.current !== o.id) {
          toast({ title: `გაიხსნა შეკვეთა #${o.public_order_number}` });
        }
        lastIdRef.current = o.id;
      }
      setLoading(false);
      // clear direction after a tick so next open without direction = no slide
      setTimeout(() => setSwitchDir(0), 350);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // End session when the modal is unmounted or the user closes it without switching
  useEffect(() => {
    return () => { void endSession("unmounted"); };
  }, []);




  const outcomeLock = useOutcomeLock();
  useDeployBusy("order-popup", !!orderId);

  // Keyboard navigation
  useEffect(() => {
    if (!orderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev && !isInputTarget(e.target)) { setSwitchDir(-1); onPrev(); }
      else if (e.key === "ArrowRight" && hasNext && !isInputTarget(e.target)) { setSwitchDir(1); onNext(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, hasPrev, hasNext, onClose, onPrev, onNext]);

  const goPrev = useCallback(() => { setSwitchDir(-1); onPrev(); }, [onPrev]);
  const goNext = useCallback(() => { setSwitchDir(1); onNext(); }, [onNext]);

  /** Collect address/note edits diff vs current loaded order */
  const collectEditUpdates = useCallback((): Record<string, unknown> => {
    if (!order) return {};
    const extra: Record<string, unknown> = {};
    if ((operatorNote || "") !== (order.internal_note || "")) extra.internal_note = operatorNote || null;
    return addr.collectUpdates(order, extra);
  }, [order, operatorNote, addr]);

  const persistUpdates = useCallback(async (updates: Record<string, unknown>): Promise<boolean> => {
    if (!order || Object.keys(updates).length === 0) return true;
    const res = await persistOrderEdits(order.id, updates, actor);
    if (!res.ok) {
      toast({ title: "შენახვა ვერ მოხერხდა", description: res.error, variant: "destructive" });
      return false;
    }
    onOrderUpdated(order.id, updates);
    setOrder({ ...order, ...(updates as Partial<OrderFull>) });
    return true;
  }, [order, actor, onOrderUpdated, toast]);

  const saveSimple = useCallback(async (): Promise<boolean> => {
    if (!order) return false;
    setSaving(true);
    const updates = collectEditUpdates();
    const ok = await persistUpdates(updates);
    if (ok && Object.keys(updates).length > 0) toast({ title: "შენახულია ✓" });
    setSaving(false);
    return ok;
  }, [order, collectEditUpdates, persistUpdates, toast]);

  const saveAndNext = async () => {
    const ok = await saveSimple();
    if (!ok) return;
    // saveSimple already markActions through persistUpdates if there were changes;
    // ensure session ends cleanly here regardless.
    void endSession("save_and_next");
    if (hasNext) goNext(); else onClose();
  };

  /** Click handler for outcome buttons.
   *  - confirmed: full save + status change (legacy).
   *  - no_answer: increments call_attempt_count, keeps status; auto-advances.
   *  - cancelled / wrong_number / duplicate: opens cancel-reason modal (preselected).
   *  - callback: opens callback picker.
   */
  const handleOutcome = async (outcome: Outcome) => {
    if (!order || outcomeLock.locked) return;

    // Address must be complete before confirming (city, street ≥3 chars, district for Tbilisi).
    if (outcome === "confirmed") {
      const v = addr.validateForConfirm();
      if (!v.ok) {
        toast({ title: "მიუთითეთ მისამართი", description: v.message, variant: "destructive" });
        void logConfirmBlocked(order.id, actor, { reason: "address_missing", missing_fields: v.field ? [v.field] : [], error_message: v.message, source: "quick_review" });
        return;
      }
    }


    // No-Answer = retry counter, not a final status.
    if (outcome === "no_answer") {
      setSaving(true);
      const result = await recordNoAnswerAttempt(order.id, actor, "quick_review", currentSessionId());
      setSaving(false);
      if (!result) {
        toast({ title: "ვერ შეინახა", variant: "destructive" });
        return;
      }
      markAction("call_attempt");
      const max = DEFAULT_MAX_CALL_ATTEMPTS;
      const nowIso = new Date().toISOString();
      onOrderUpdated(order.id, {
        call_attempt_count: result.count,
        last_call_attempt_at: nowIso,
        last_call_attempt_by: actor,
        operator_review_status: "no_answer",
        call_outcome: "no_answer",
      });
      setOrder({
        ...order,
        call_attempt_count: result.count,
        last_call_attempt_at: nowIso,
        last_call_attempt_by: actor,
        operator_review_status: "no_answer",
        call_outcome: "no_answer",
      });
      toast({ title: `ცდა შენახულია: არ პასუხობს ${result.count}/${max}` });
      void endSession("no_answer", "no_answer");
      if (hasNext) setTimeout(() => goNext(), 280);
      return;
    }

    // Callback → open scheduler
    if (outcome === "callback") {
      setCallbackOpen(true);
      return;
    }

    // Cancellations route through reason modal
    if (outcome === "cancelled") {
      setCancelPreselect(null);
      setCancelOpen(true);
      return;
    }

    // Confirmed (legacy path) — full save + status change
    const def = OUTCOMES.find((o) => o.key === outcome)!;
    setSaving(true);
    const updates = collectEditUpdates();
    updates.call_outcome = outcome;
    updates.call_outcome_updated_at = new Date().toISOString();
    updates.call_outcome_updated_by = actor;
    updates.operator_review_status = outcome;
    if (def.status) updates.status = def.status;
    if (def.isConfirmed !== undefined) updates.is_confirmed = def.isConfirmed;
    if (def.reviewRequired !== undefined) updates.review_required = def.reviewRequired;

    let ok = false;
    try {
      const res = await persistOrderEdits(order.id, updates, actor);
      ok = res.ok;
      if (!res.ok) {
        toast({ title: "შენახვა ვერ მოხერხდა", description: res.error, variant: "destructive" });
        void logConfirmBlocked(order.id, actor, { reason: classifyConfirmError(res.error), error_message: res.error ?? null, source: "quick_review" });
      } else {
        onOrderUpdated(order.id, updates);
        setOrder({ ...order, ...(updates as Partial<OrderFull>) });
      }
    } catch (e) {
      const msg = (e as Error)?.message || String(e);
      toast({ title: "შენახვა ვერ მოხერხდა", description: msg, variant: "destructive" });
      void logConfirmBlocked(order.id, actor, { reason: "network", error_message: msg, source: "quick_review" });
    }
    if (!ok) { setSaving(false); return; }

    if (def.isConfirmed === true) await applyOrderConfirmStock(order.id);
    await logCallOutcome(order.id, actor, "confirmed", {
      attempt_number: Number(order.call_attempt_count || 0) + 1,
      source: "quick_review",
      session_id: currentSessionId(),
    });

    markAction("outcome");
    await logSystemEvent({
      entityType: "order", entityId: order.id,
      eventType: "ORDER_CALL_OUTCOME" as any, actorId: actor,
      payload: { outcome, mapped_status: def.status || null },
    });
    setSaving(false);
    toast({ title: `${def.label} — შენახულია` });
    void endSession("outcome", outcome);
    if (hasNext) setTimeout(() => goNext(), 320);
  };

  const handleCancelConfirm = async (reason: CancelReason, note: string | null) => {
    if (!order) return;
    setSaving(true);
    // Save current edits first so address/notes aren't lost
    const editUpdates = collectEditUpdates();
    if (Object.keys(editUpdates).length > 0) await persistUpdates(editUpdates);

    const ok = await cancelOrderWithReason(
      order.id, actor, reason, note,
      Number(order.call_attempt_count || 0), undefined, "quick_review", currentSessionId(),
    );
    setSaving(false);
    if (!ok) { toast({ title: "გაუქმება ვერ მოხერხდა", variant: "destructive" }); return; }
    await applyOrderCancelStock(order.id, restoreStock);
    markAction("cancel");
    setCancelOpen(false);
    setCancelPreselect(null);
    const patch = {
      status: "canceled",
      is_confirmed: false,
      final_cancel_reason: reason,
      final_cancel_note: note,
      operator_review_status: "cancelled",
      call_outcome: "cancelled",
    };
    onOrderUpdated(order.id, patch);
    setOrder({ ...order, ...(patch as Partial<OrderFull>) });
    toast({ title: "შეკვეთა გაუქმდა" });
    void endSession("outcome", "cancelled");
    if (hasNext) setTimeout(() => goNext(), 280);
  };

  const handleCallbackConfirm = async (whenIso: string) => {
    if (!order) return;
    setSaving(true);
    const ok = await scheduleCallback(order.id, actor, whenIso, "quick_review", currentSessionId());
    setSaving(false);
    if (!ok) { toast({ title: "გადარეკვის შენახვა ვერ მოხერხდა", variant: "destructive" }); return; }
    markAction("callback");
    setCallbackOpen(false);
    const patch = {
      status: "on_hold",
      next_call_after: whenIso,
      operator_review_status: "callback",
      call_outcome: "callback",
    };
    onOrderUpdated(order.id, patch);
    setOrder({ ...order, ...(patch as Partial<OrderFull>) });
    toast({ title: `გადარეკვა დანიშნულია: ${new Date(whenIso).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` });
    void endSession("outcome", "callback");
    if (hasNext) setTimeout(() => goNext(), 280);
  };


  const copyPhone = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.customer_phone);
    toast({ title: "ნომერი დაკოპირდა" });
  };

  // -------- Item add/edit (shared OrderItemsEditor) --------
  const handleItemsChanged = useCallback((patch: { order_items: OrderItem[]; subtotal: number; total: number }) => {
    if (!order) return;
    setOrder((o) => (o ? { ...o, ...patch } : o));
    onOrderUpdated(order.id, { subtotal: patch.subtotal, total: patch.total });
  }, [order, onOrderUpdated]);

  if (!orderId) return null;

  const containerCls = isMobile
    ? "fixed inset-0 z-[60] bg-background flex flex-col"
    : "fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4";
  const panelCls = isMobile
    ? "flex flex-col h-full w-full"
    : "bg-background rounded-xl shadow-2xl w-full max-w-[880px] max-h-[94vh] flex flex-col overflow-hidden border border-border";

  const slideCls = switchDir === 1
    ? "animate-in fade-in slide-in-from-right-6 duration-300"
    : switchDir === -1
    ? "animate-in fade-in slide-in-from-left-6 duration-300"
    : "";

  const currentOutcome = (order?.call_outcome || order?.operator_review_status) as Outcome | undefined;
  const currentOutcomeValid = currentOutcome && OUTCOMES.some((o) => o.key === currentOutcome);

  return (
    <div className={containerCls} onClick={(e) => { if (!isMobile && e.target === e.currentTarget) onClose(); }}>
      <div className={panelCls}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" disabled={!hasPrev || saving} onClick={goPrev} aria-label="Previous">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" disabled={!hasNext || saving} onClick={goNext} aria-label="Next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 min-w-0">
            {order ? (
              <div key={order.id} className={slideCls}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base">შეკვეთა #{order.public_order_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${statusColor[order.status] || "bg-muted"}`}>
                    {order.status.replace("_", " ")}
                  </span>
                  {currentOutcomeValid && (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${OUTCOME_BADGE_CLS[currentOutcome!]}`}>
                      {OUTCOME_LABEL[currentOutcome!]}
                    </span>
                  )}
                  {saving && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> ინახება…</span>}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {order.customer_phone} · {order.payment_method} · {Number(order.total).toFixed(2)} ₾ ·{" "}
                  {new Date(order.created_at).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="gap-1 hidden sm:inline-flex"
            onClick={() => order && navigate(`/admin/orders/${order.id}`)}>
            <ExternalLink className="w-3.5 h-3.5" /> Advanced
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {loading || !order ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div key={order.id} className={slideCls + " space-y-4"}>
              {/* Customer */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">მომხმარებელი</h3>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-semibold">{order.customer_name || "—"}</div>
                    <a
                      href={toTelHref(order.customer_phone)}
                      onClick={(e) => {
                        const desktopOnly = isDesktopDevice() && !getOpenTelOnThisDevice();
                        if (desktopOnly) e.preventDefault();
                        if (user) {
                          startCallSync({
                            operatorId: user.id,
                            orderId: order.id,
                            phone: order.customer_phone,
                            customerName: order.customer_name,
                          });
                        }
                        if (desktopOnly) toast({ title: `📱 გაიგზავნა ტელეფონზე — ${order.customer_phone}` });
                      }}
                      className="text-2xl font-extrabold text-primary tracking-wide hover:underline"
                    >
                      {order.customer_phone}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <CallButton
                      orderId={order.id}
                      phone={order.customer_phone}
                      customerName={order.customer_name}
                    />
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={copyPhone}>
                      <Copy className="w-4 h-4" /> კოპირება
                    </Button>
                    <IssueFlagButton orderId={order.id} source="quick_review" />
                  </div>
                </div>
                {order.notes_customer && (
                  <p className="text-xs text-muted-foreground italic mt-2">"{order.notes_customer}"</p>
                )}
              </section>

              {outcomeLock.locked && <OutcomeLockBanner orderId={order.id} onNavigate={onClose} />}

              {/* Previous orders from same phone */}
              <PreviousOrdersPanel
                order={order}
                currentSkus={order.order_items?.map((i) => i.sku) || []}
                actor={actor}
              />


              {/* Call attempts */}
              <CallAttemptsPanel
                count={Number(order.call_attempt_count || 0)}
                lastAt={order.last_call_attempt_at}
                lastBy={order.last_call_attempt_by}
                nextCallAfter={order.next_call_after}
              />

              {/* Outcome buttons */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">ზარის შედეგი</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {OUTCOMES.map((o) => {
                    const isSel = currentOutcome === o.key;
                    const attempts = Number(order.call_attempt_count || 0);
                    const maxReached = attempts >= DEFAULT_MAX_CALL_ATTEMPTS;
                    const isNoAnswer = o.key === "no_answer";
                    const disabled = saving || outcomeLock.locked || (isNoAnswer && maxReached);
                    const label = isNoAnswer
                      ? maxReached
                        ? "მაქს. ცდები ⛔"
                        : `არ პასუხობს — ცდა ${attempts + 1}/${DEFAULT_MAX_CALL_ATTEMPTS}`
                      : o.label;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleOutcome(o.key)}
                        className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 font-bold text-sm transition-all disabled:opacity-60 ${isSel ? o.selected + " scale-[1.02]" : o.unselected}`}
                        title={outcomeLock.locked ? outcomeLock.reason ?? undefined : isNoAnswer && maxReached ? "გააუქმე მიზეზით: არ პასუხობს რამდენიმე ცდის შემდეგ" : undefined}
                      >
                        {isSel ? <Check className="w-4 h-4" /> : <o.Icon className="w-4 h-4" />}
                        <span className="truncate">{label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  „არ პასუხობს" ინახავს ცდას და გადადის შემდეგ შეკვეთაზე — სტატუსი არ იცვლება. „გაუქმდა" საჭიროებს მიზეზის არჩევას.
                </p>
              </section>


              {/* Address */}
              <AddressFields state={addr} order={order} />

              {/* Items */}
              <OrderItemsEditor
                key={order.id}
                order={order}
                actor={actor}
                saving={saving}
                onChanged={handleItemsChanged}
                onCreateReturn={() => setReturnOpen(true)}
              />

              {/* Operator note */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ოპერატორის შენიშვნა</Label>
                <textarea value={operatorNote} onChange={(e) => setOperatorNote(e.target.value)}
                  placeholder="მაგ: დაურეკე 2 საათში, სთხოვა გადადება..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px]" />
              </section>

              {/* Activity log */}
              <OrderActivityLog orderId={order.id} refreshKey={saving ? 0 : 1} />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 z-10 bg-background border-t border-border px-4 py-3 flex flex-col-reverse sm:flex-row gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>დახურვა</Button>
          <Button onClick={saveSimple} disabled={saving || !order} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            შენახვა
          </Button>
          <Button onClick={saveAndNext} disabled={saving || !order || !hasNext} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
            შენახვა და შემდეგი <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <CancelReasonModal
        open={cancelOpen}
        orderNumber={order?.public_order_number}
        callAttemptCount={Number(order?.call_attempt_count || 0)}
        preselect={cancelPreselect}
        submitting={saving}
        onCancel={() => { setCancelOpen(false); setCancelPreselect(null); }}
        onConfirm={handleCancelConfirm}
        restoreStock={restoreStock}
        onRestoreStockChange={setRestoreStock}
      />
      <CallbackPickerModal
        open={callbackOpen}
        submitting={saving}
        onCancel={() => setCallbackOpen(false)}
        onConfirm={handleCallbackConfirm}
      />
      {order && (
        <CreateReturnModal
          open={returnOpen}
          orderId={order.id}
          actor={actor}
          onClose={() => setReturnOpen(false)}
          onCreated={(_id, _num, leadClosed) => { if (leadClosed) { onOrderUpdated?.(order.id, { status: "merged" } as any); if (hasNext) goNext(); else onClose(); } }}
        />
      )}
    </div>



  );
}

function isInputTarget(t: EventTarget | null) {
  if (!t) return false;
  const tag = (t as HTMLElement).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (t as HTMLElement).isContentEditable;
}
