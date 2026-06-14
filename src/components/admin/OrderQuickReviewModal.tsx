import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  X, ChevronLeft, ChevronRight, Phone, Copy, ExternalLink, Loader2,
  CheckCircle2, PhoneOff, RotateCcw, XCircle, Save, ArrowRight, ChevronDown,
  Search, Plus, Minus, Trash2, AlertTriangle, UserX, Files, Check,
} from "lucide-react";
import { logSystemEvent } from "@/lib/systemEventService";
import OrderActivityLog from "@/components/admin/OrderActivityLog";
import { startSession, markAction, endSession } from "@/lib/operatorSession";

type Outcome = "confirmed" | "no_answer" | "callback" | "cancelled" | "wrong_number" | "duplicate";

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
  { key: "wrong_number", label: "არასწორი ნომერი", Icon: UserX,
    unselected: "border-rose-400 text-rose-800 bg-rose-50/60 hover:bg-rose-100",
    selected:   "border-rose-800 text-white bg-rose-800 shadow-md ring-2 ring-rose-300",
    status: "canceled" },
  { key: "duplicate", label: "დუბლიკატი", Icon: Files,
    unselected: "border-purple-300 text-purple-700 bg-purple-50/60 hover:bg-purple-100",
    selected:   "border-purple-600 text-white bg-purple-600 shadow-md ring-2 ring-purple-300",
    status: "canceled" },
];

export const OUTCOME_LABEL: Record<string, string> = Object.fromEntries(
  OUTCOMES.map((o) => [o.key, o.label])
);
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

function callNormalize(orderId: string) {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${url}/functions/v1/normalize-and-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) { console.warn("normalize call failed", e); }
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  /** Direction the panel should animate (1 = next/right, -1 = prev/left, 0 = none) */
  const [switchDir, setSwitchDir] = useState<0 | 1 | -1>(0);
  const lastIdRef = useRef<string | null>(null);

  // Simple operator fields
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [courierNote, setCourierNote] = useState("");
  const [operatorNote, setOperatorNote] = useState("");

  // Advanced
  const [advRawCity, setAdvRawCity] = useState("");
  const [advNormCity, setAdvNormCity] = useState("");
  const [advRawAddr, setAdvRawAddr] = useState("");
  const [advNormAddr, setAdvNormAddr] = useState("");

  // Product search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const actor = user?.email || "admin";

  // Load order whenever id changes & mark viewed
  useEffect(() => {
    if (!orderId) { lastIdRef.current = null; return; }
    // direction is already set by goPrev/goNext callers; first open = 0
    let cancelled = false;
    setLoading(true);
    setAdvancedOpen(false);
    setSearchOpen(false);
    setSearchTerm("");
    setSearchResults([]);

    (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, public_order_number, created_at, status, payment_method, customer_name, customer_phone, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address, subtotal, shipping_fee, discount_total, total, is_confirmed, is_fulfilled, is_tbilisi, internal_note, notes_customer, operator_review_status, operator_viewed_at, call_outcome, order_items(id, product_id, title, sku, quantity, unit_price, line_total, image_url)"
        )
        .eq("id", orderId)
        .maybeSingle();
      if (cancelled) return;
      const o = data as unknown as OrderFull | null;
      setOrder(o);
      if (o) {
        setCity(o.city || "");
        setAddress(o.address_line1 || "");
        setCourierNote(o.address_line2 || "");
        setOperatorNote(o.internal_note || "");
        setAdvRawCity(o.raw_city || "");
        setAdvNormCity(o.normalized_city || "");
        setAdvRawAddr(o.raw_address || "");
        setAdvNormAddr(o.normalized_address || "");

        // Always log a per-session "order_opened" event for operator stats
        supabase.from("order_events").insert({
          order_id: o.id, actor, event_type: "order_opened", payload: {} as any,
        });

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
    const updates: Record<string, unknown> = {};
    const trimmedCity = city.trim();
    const trimmedAddr = address.trim();

    if (trimmedCity !== (order.city || "")) {
      updates.city = trimmedCity;
      updates.raw_city = trimmedCity;
      const lower = trimmedCity.toLowerCase();
      updates.is_tbilisi = lower === "თბილისი" || lower === "tbilisi";
    }
    if (trimmedAddr !== (order.address_line1 || "")) {
      updates.address_line1 = trimmedAddr;
      updates.raw_address = trimmedAddr;
    }
    if ((courierNote || "") !== (order.address_line2 || "")) {
      updates.address_line2 = courierNote || null;
    }
    if ((operatorNote || "") !== (order.internal_note || "")) {
      updates.internal_note = operatorNote || null;
    }
    if (advancedOpen) {
      if (advRawCity !== (order.raw_city || "")) updates.raw_city = advRawCity || null;
      if (advNormCity !== (order.normalized_city || "")) updates.normalized_city = advNormCity || null;
      if (advRawAddr !== (order.raw_address || "")) updates.raw_address = advRawAddr || null;
      if (advNormAddr !== (order.normalized_address || "")) updates.normalized_address = advNormAddr || null;
    }
    return updates;
  }, [order, city, address, courierNote, operatorNote, advancedOpen, advRawCity, advNormCity, advRawAddr, advNormAddr]);

  const persistUpdates = useCallback(async (updates: Record<string, unknown>): Promise<boolean> => {
    if (!order || Object.keys(updates).length === 0) return true;
    const { error } = await supabase.from("orders").update(updates).eq("id", order.id);
    if (error) {
      toast({ title: "შენახვა ვერ მოხერხდა", description: error.message, variant: "destructive" });
      return false;
    }
    await supabase.from("order_events").insert({
      order_id: order.id, actor, event_type: "manual_edit",
      payload: { section: "quick_review", changed: Object.keys(updates) } as any,
    });
    if (updates.city !== undefined || updates.address_line1 !== undefined) callNormalize(order.id);
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
    if (hasNext) goNext(); else onClose();
  };

  /** Click handler for outcome buttons.
   *  Confirmed = full save (address/notes) + status change.
   *  Other outcomes = save current edits + outcome label + mapped status.
   *  Always auto-advances on success when hasNext. */
  const handleOutcome = async (outcome: Outcome) => {
    if (!order) return;
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

    const ok = await persistUpdates(updates);
    if (!ok) { setSaving(false); return; }

    await logSystemEvent({
      entityType: "order", entityId: order.id,
      eventType: "ORDER_CALL_OUTCOME" as any, actorId: actor,
      payload: { outcome, mapped_status: def.status || null },
    });

    setSaving(false);
    toast({ title: `${def.label} — შენახულია` });

    if (hasNext) {
      // small feedback delay so operator sees selected state before advancing
      setTimeout(() => { goNext(); }, 320);
    }
  };

  const copyPhone = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.customer_phone);
    toast({ title: "ნომერი დაკოპირდა" });
  };

  // -------- Item add/edit --------

  const refreshItemsAndTotals = useCallback(async () => {
    if (!order) return;
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_id, title, sku, quantity, unit_price, line_total, image_url")
      .eq("order_id", order.id);
    const list = (items || []) as OrderItem[];
    const newSubtotal = list.reduce((s, i) => s + Number(i.line_total), 0);
    const shipping = Number(order.shipping_fee || 0);
    const discount = Number(order.discount_total || 0);
    const newTotal = newSubtotal + shipping - discount;
    await supabase.from("orders").update({ subtotal: newSubtotal, total: newTotal }).eq("id", order.id);
    setOrder({ ...order, order_items: list, subtotal: newSubtotal, total: newTotal });
    onOrderUpdated(order.id, { subtotal: newSubtotal, total: newTotal });
  }, [order, onOrderUpdated]);

  const changeItemQty = async (item: OrderItem, nextQty: number) => {
    if (nextQty < 1 || !order) return;
    const newLineTotal = nextQty * Number(item.unit_price);
    const { error } = await supabase
      .from("order_items")
      .update({ quantity: nextQty, line_total: newLineTotal })
      .eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({
      order_id: order.id, actor, event_type: "item_quantity_change",
      payload: { item_id: item.id, sku: item.sku, from: item.quantity, to: nextQty } as any,
    });
    await refreshItemsAndTotals();
  };

  const removeItem = async (item: OrderItem) => {
    if (!order) return;
    if (!confirm(`${item.title} — წავშალო შეკვეთიდან?`)) return;
    const { error } = await supabase.from("order_items").delete().eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({
      order_id: order.id, actor, event_type: "item_removed",
      payload: { item_id: item.id, sku: item.sku, title: item.title } as any,
    });
    await refreshItemsAndTotals();
    toast({ title: "წაიშალა" });
  };

  // Search products with debounce
  useEffect(() => {
    if (!searchOpen) return;
    const term = searchTerm.trim();
    if (term.length < 2) { setSearchResults([]); return; }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("id, title, sku, price, image, available")
        .or(`title.ilike.%${term}%,sku.ilike.%${term}%,id.ilike.%${term}%`)
        .limit(20);
      if (cancelled) return;
      setSearchResults((data as ProductSearchResult[]) || []);
      setSearching(false);
    }, 220);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchTerm, searchOpen]);

  const addProduct = async (p: ProductSearchResult) => {
    if (!order) return;
    const existing = order.order_items.find((i) => i.product_id === p.id || i.sku === p.sku);
    if (existing) {
      await changeItemQty(existing, existing.quantity + 1);
      toast({ title: "პროდუქტი უკვე იყო — რაოდენობა გაიზარდა" });
    } else {
      const newLine = Number(p.price);
      const { error } = await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: p.id,
        sku: p.sku || p.id,
        title: p.title,
        quantity: 1,
        unit_price: p.price,
        line_total: newLine,
        image_url: p.image || "",
      });
      if (error) { toast({ title: "Add failed", description: error.message, variant: "destructive" }); return; }
      await supabase.from("order_events").insert({
        order_id: order.id, actor, event_type: "item_added",
        payload: { product_id: p.id, sku: p.sku, title: p.title, quantity: 1, unit_price: Number(p.price), added_revenue: Number(p.price) } as any,
      });
      await refreshItemsAndTotals();
      toast({ title: `დაემატა: ${p.title}` });
    }
    setSearchTerm("");
    setSearchResults([]);
  };

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
                    <a href={`tel:${order.customer_phone}`} className="text-2xl font-extrabold text-primary tracking-wide hover:underline">
                      {order.customer_phone}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:${order.customer_phone}`}>
                      <Button size="sm" className="gap-1.5"><Phone className="w-4 h-4" /> დარეკვა</Button>
                    </a>
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={copyPhone}>
                      <Copy className="w-4 h-4" /> კოპირება
                    </Button>
                  </div>
                </div>
                {order.notes_customer && (
                  <p className="text-xs text-muted-foreground italic mt-2">"{order.notes_customer}"</p>
                )}
              </section>

              {/* Outcome buttons */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">ზარის შედეგი</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {OUTCOMES.map((o) => {
                    const isSel = currentOutcome === o.key;
                    return (
                      <button
                        key={o.key}
                        type="button"
                        disabled={saving}
                        onClick={() => handleOutcome(o.key)}
                        className={`relative flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border-2 font-bold text-sm transition-all disabled:opacity-60 ${isSel ? o.selected + " scale-[1.02]" : o.unselected}`}
                      >
                        {isSel ? <Check className="w-4 h-4" /> : <o.Icon className="w-4 h-4" />}
                        <span className="truncate">{o.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  „დადასტურდა" ინახავს ყველა შესწორებას (მისამართი, შენიშვნა, პროდუქტები) და სტატუსს ცვლის — ისევე როგორც ქვედა „შენახვა".
                </p>
              </section>

              {/* Address */}
              <section className="rounded-lg border border-border p-3 bg-card space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">მისამართი</h3>
                <div>
                  <Label className="text-xs">ქალაქი / რეგიონი</Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="მაგ: თბილისი / ქუთაისი" className="h-11 text-base" />
                </div>
                <div>
                  <Label className="text-xs">მისამართი</Label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="ქუჩა, კორპუსი, ბინა ან სოფელი" className="h-11 text-base" />
                </div>
                <div>
                  <Label className="text-xs">კომენტარი კურიერისთვის</Label>
                  <textarea value={courierNote} onChange={(e) => setCourierNote(e.target.value)}
                    placeholder="სადარბაზო, სართული, დამატებითი მინიშნება"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-base min-h-[60px]" />
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                    Advanced address fields
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2 pt-2 border-t border-dashed border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-[10px] uppercase text-muted-foreground">Raw city</Label>
                        <Input value={advRawCity} onChange={(e) => setAdvRawCity(e.target.value)} className="h-8 text-xs" /></div>
                      <div><Label className="text-[10px] uppercase text-muted-foreground">Normalized city</Label>
                        <Input value={advNormCity} onChange={(e) => setAdvNormCity(e.target.value)} className="h-8 text-xs" /></div>
                      <div><Label className="text-[10px] uppercase text-muted-foreground">Raw address</Label>
                        <Input value={advRawAddr} onChange={(e) => setAdvRawAddr(e.target.value)} className="h-8 text-xs" /></div>
                      <div><Label className="text-[10px] uppercase text-muted-foreground">Normalized address</Label>
                        <Input value={advNormAddr} onChange={(e) => setAdvNormAddr(e.target.value)} className="h-8 text-xs" /></div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">⚠ Advanced fields override simple input on save.</p>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Items */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">პროდუქტები</h3>
                  <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setSearchOpen((v) => !v)}>
                    <Plus className="w-3.5 h-3.5" /> პროდუქტის დამატება
                  </Button>
                </div>

                {searchOpen && (
                  <div className="mb-3 rounded-md border border-dashed border-border p-2 bg-muted/30">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        autoFocus
                        placeholder="ძებნა SKU, სახელი ან ID…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                    </div>
                    <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-border/60">
                      {searching && <div className="py-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> ვძებნი…</div>}
                      {!searching && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
                        <div className="py-3 text-center text-xs text-muted-foreground">ვერ მოიძებნა</div>
                      )}
                      {searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => addProduct(p)}
                          className="w-full flex items-center gap-2 py-2 px-1 hover:bg-background rounded text-left"
                        >
                          <div className="w-9 h-9 rounded border border-border overflow-hidden flex-shrink-0">
                            {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{p.title}</div>
                            <div className="text-[11px] text-muted-foreground">SKU {p.sku || p.id} · {Number(p.price).toFixed(1)} ₾
                              {!p.available && <span className="ml-1.5 text-rose-600 font-bold inline-flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" /> მარაგში არ არის</span>}
                            </div>
                          </div>
                          <Plus className="w-4 h-4 text-emerald-600" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {order.order_items?.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 text-sm border-b border-border/60 last:border-0 pb-2 last:pb-0">
                      <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
                        {it.image_url && <img src={it.image_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{it.title}</div>
                        <div className="text-xs text-muted-foreground">SKU {it.sku} · {Number(it.unit_price).toFixed(1)} ₾</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeItemQty(it, it.quantity - 1)} disabled={saving || it.quantity <= 1}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-7 text-center font-bold text-sm">{it.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => changeItemQty(it, it.quantity + 1)} disabled={saving}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="font-bold whitespace-nowrap w-16 text-right">{Number(it.line_total).toFixed(1)} ₾</div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(it)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                  {(!order.order_items || order.order_items.length === 0) && (
                    <div className="text-xs text-muted-foreground py-3 text-center">პროდუქტი არ არის</div>
                  )}
                </div>

                {/* Totals */}
                <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{Number(order.subtotal).toFixed(1)} ₾</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">მიწოდება</span><span>{Number(order.shipping_fee).toFixed(1)} ₾</span></div>
                  <div className="flex justify-between font-bold text-base"><span>სულ</span><span>{Number(order.total).toFixed(1)} ₾</span></div>
                </div>
              </section>

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
    </div>
  );
}

function isInputTarget(t: EventTarget | null) {
  if (!t) return false;
  const tag = (t as HTMLElement).tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (t as HTMLElement).isContentEditable;
}
