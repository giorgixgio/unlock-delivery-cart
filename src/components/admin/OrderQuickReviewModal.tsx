import { useState, useEffect, useCallback } from "react";
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
} from "lucide-react";

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
  /** Called after each save so the parent list can patch the row locally */
  onOrderUpdated: (orderId: string, patch: Record<string, unknown>) => void;
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
  total: number;
  is_confirmed: boolean;
  is_fulfilled: boolean;
  is_tbilisi: boolean;
  internal_note: string | null;
  notes_customer: string | null;
  operator_review_status: string | null;
  operator_viewed_at: string | null;
  order_items: {
    id: string;
    title: string;
    sku: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    image_url: string;
  }[];
}

function callNormalize(orderId: string) {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${url}/functions/v1/normalize-and-score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) {
    console.warn("normalize call failed", e);
  }
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

  // Simple operator fields
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [courierNote, setCourierNote] = useState(""); // address_line2
  const [operatorNote, setOperatorNote] = useState(""); // internal_note

  // Advanced
  const [advRawCity, setAdvRawCity] = useState("");
  const [advNormCity, setAdvNormCity] = useState("");
  const [advRawAddr, setAdvRawAddr] = useState("");
  const [advNormAddr, setAdvNormAddr] = useState("");

  const actor = user?.email || "admin";

  // Load order whenever id changes & mark viewed
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    setAdvancedOpen(false);

    (async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, public_order_number, created_at, status, payment_method, customer_name, customer_phone, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address, total, is_confirmed, is_fulfilled, is_tbilisi, internal_note, notes_customer, operator_review_status, operator_viewed_at, order_items(id, title, sku, quantity, unit_price, line_total, image_url)"
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

        // Mark viewed (only if not yet viewed) — fire and forget
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
      }
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Keyboard navigation
  useEffect(() => {
    if (!orderId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev && !isInputTarget(e.target)) onPrev();
      else if (e.key === "ArrowRight" && hasNext && !isInputTarget(e.target)) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderId, hasPrev, hasNext, onClose, onPrev, onNext]);

  const saveSimple = useCallback(async (): Promise<boolean> => {
    if (!order) return false;
    setSaving(true);
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
    // Advanced overrides (only when opened & changed)
    if (advancedOpen) {
      if (advRawCity !== (order.raw_city || "")) updates.raw_city = advRawCity || null;
      if (advNormCity !== (order.normalized_city || "")) updates.normalized_city = advNormCity || null;
      if (advRawAddr !== (order.raw_address || "")) updates.raw_address = advRawAddr || null;
      if (advNormAddr !== (order.normalized_address || "")) updates.normalized_address = advNormAddr || null;
    }

    if (Object.keys(updates).length === 0) {
      setSaving(false);
      return true;
    }

    const { error } = await supabase.from("orders").update(updates).eq("id", order.id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return false;
    }

    await supabase.from("order_events").insert({
      order_id: order.id,
      actor,
      event_type: "manual_edit",
      payload: { section: "quick_review", changed: Object.keys(updates) } as any,
    });

    // Re-normalize if city/address text changed (preserves normalized fields on failure)
    if (updates.city !== undefined || updates.address_line1 !== undefined) {
      callNormalize(order.id);
    }

    onOrderUpdated(order.id, updates);
    setOrder({ ...order, ...(updates as Partial<OrderFull>) });
    toast({ title: "შენახულია ✓" });
    setSaving(false);
    return true;
  }, [order, city, address, courierNote, operatorNote, advancedOpen, advRawCity, advNormCity, advRawAddr, advNormAddr, actor, onOrderUpdated, toast]);

  const saveAndNext = async () => {
    const ok = await saveSimple();
    if (ok && hasNext) onNext();
    else if (ok) onClose();
  };

  const setQuickStatus = async (
    label: "confirmed" | "no_answer" | "needs_callback" | "cancelled"
  ) => {
    if (!order) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      operator_review_status: label,
    };
    if (label === "confirmed") {
      updates.is_confirmed = true;
      updates.status = "confirmed";
      updates.review_required = false;
    } else if (label === "cancelled") {
      updates.status = "canceled";
    } else if (label === "needs_callback") {
      updates.status = "on_hold";
    }
    const { error } = await supabase.from("orders").update(updates).eq("id", order.id);
    if (error) {
      toast({ title: "Status update failed", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }
    await supabase.from("order_events").insert({
      order_id: order.id,
      actor,
      event_type: "operator_quick_status",
      payload: { label } as any,
    });
    onOrderUpdated(order.id, updates);
    setOrder({ ...order, ...(updates as Partial<OrderFull>) });
    toast({ title: `მონიშნულია: ${label}` });
    setSaving(false);
  };

  const copyPhone = () => {
    if (!order) return;
    navigator.clipboard.writeText(order.customer_phone);
    toast({ title: "ნომერი დაკოპირდა" });
  };

  if (!orderId) return null;

  const containerCls = isMobile
    ? "fixed inset-0 z-[60] bg-background flex flex-col"
    : "fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4";
  const panelCls = isMobile
    ? "flex flex-col h-full w-full"
    : "bg-background rounded-xl shadow-2xl w-full max-w-[860px] max-h-[92vh] flex flex-col overflow-hidden border border-border";

  return (
    <div className={containerCls} onClick={(e) => { if (!isMobile && e.target === e.currentTarget) onClose(); }}>
      <div className={panelCls}>
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" disabled={!hasPrev} onClick={onPrev} aria-label="Previous">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" disabled={!hasNext} onClick={onNext} aria-label="Next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex-1 min-w-0">
            {order ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-base">შეკვეთა #{order.public_order_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${statusColor[order.status] || "bg-muted"}`}>
                    {order.status.replace("_", " ")}
                  </span>
                  {order.operator_review_status && order.operator_review_status !== "viewed" && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
                      {order.operator_review_status}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {order.customer_phone} · {order.payment_method} · {Number(order.total).toFixed(2)} ₾ ·{" "}
                  {new Date(order.created_at).toLocaleString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </div>
              </>
            ) : (
              <span className="text-sm text-muted-foreground">Loading…</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 hidden sm:inline-flex"
            onClick={() => order && navigate(`/admin/orders/${order.id}`)}
          >
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
            <>
              {/* Customer */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">მომხმარებელი</h3>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="font-semibold">{order.customer_name || "—"}</div>
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="text-2xl font-extrabold text-primary tracking-wide hover:underline"
                    >
                      {order.customer_phone}
                    </a>
                  </div>
                  <div className="flex gap-2">
                    <a href={`tel:${order.customer_phone}`}>
                      <Button size="sm" className="gap-1.5">
                        <Phone className="w-4 h-4" /> დარეკვა
                      </Button>
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

              {/* Quick status */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">ზარის შედეგი</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setQuickStatus("confirmed")} className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                    <CheckCircle2 className="w-4 h-4" /> დადასტურდა
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setQuickStatus("no_answer")} className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
                    <PhoneOff className="w-4 h-4" /> არ პასუხობს
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setQuickStatus("needs_callback")} className="gap-1.5 border-orange-300 text-orange-700 hover:bg-orange-50">
                    <RotateCcw className="w-4 h-4" /> გადასარეკია
                  </Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setQuickStatus("cancelled")} className="gap-1.5 border-red-300 text-red-700 hover:bg-red-50">
                    <XCircle className="w-4 h-4" /> გაუქმდა
                  </Button>
                </div>
              </section>

              {/* Address (simple) */}
              <section className="rounded-lg border border-border p-3 bg-card space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">მისამართი</h3>
                <div>
                  <Label className="text-xs">ქალაქი / რეგიონი</Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="მაგ: თბილისი / ქუთაისი / ზუგდიდი"
                    className="h-11 text-base"
                  />
                </div>
                <div>
                  <Label className="text-xs">მისამართი</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="ქუჩა, კორპუსი, ბინა ან სოფელი"
                    className="h-11 text-base"
                  />
                </div>
                <div>
                  <Label className="text-xs">კომენტარი კურიერისთვის</Label>
                  <textarea
                    value={courierNote}
                    onChange={(e) => setCourierNote(e.target.value)}
                    placeholder="სადარბაზო, სართული, დამატებითი მინიშნება"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-base min-h-[60px]"
                  />
                </div>

                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
                    Advanced address fields
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2 pt-2 border-t border-dashed border-border">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Raw city</Label>
                        <Input value={advRawCity} onChange={(e) => setAdvRawCity(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Normalized city</Label>
                        <Input value={advNormCity} onChange={(e) => setAdvNormCity(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Raw address</Label>
                        <Input value={advRawAddr} onChange={(e) => setAdvRawAddr(e.target.value)} className="h-8 text-xs" />
                      </div>
                      <div>
                        <Label className="text-[10px] uppercase text-muted-foreground">Normalized address</Label>
                        <Input value={advNormAddr} onChange={(e) => setAdvNormAddr(e.target.value)} className="h-8 text-xs" />
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      ⚠ Advanced fields override simple input on save. Normalized fields are normally rewritten by the normalizer.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </section>

              {/* Items */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">პროდუქტები</h3>
                <div className="space-y-2">
                  {order.order_items?.map((it) => (
                    <div key={it.id} className="flex items-center gap-2 text-sm">
                      <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
                        {it.image_url && <img src={it.image_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{it.title}</div>
                        <div className="text-xs text-muted-foreground">SKU {it.sku} · {it.quantity} × {Number(it.unit_price).toFixed(1)} ₾</div>
                      </div>
                      <div className="font-bold whitespace-nowrap">{Number(it.line_total).toFixed(1)} ₾</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Operator note */}
              <section className="rounded-lg border border-border p-3 bg-card">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">ოპერატორის შენიშვნა</Label>
                <textarea
                  value={operatorNote}
                  onChange={(e) => setOperatorNote(e.target.value)}
                  placeholder="მაგ: დაურეკე 2 საათში, სთხოვა გადადება..."
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[70px]"
                />
              </section>
            </>
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
            შენახვა და შემდეგი
            <ArrowRight className="w-4 h-4" />
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
