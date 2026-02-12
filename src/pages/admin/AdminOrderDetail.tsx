import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, User, Save,
  CheckCircle, AlertTriangle, ShieldAlert, GitMerge, Undo2, XCircle, PauseCircle, Sparkles,
} from "lucide-react";
import RiskBadge from "@/components/admin/RiskBadge";
import FulfillmentBadge from "@/components/admin/FulfillmentBadge";
import EditableOrderFields from "@/components/admin/EditableOrderFields";
import EditableItemRow from "@/components/admin/EditableItemRow";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logSystemEvent, logSystemEventFailed } from "@/lib/systemEventService";
import { checkIdempotency, recordIdempotency, versionedOrderUpdate } from "@/lib/idempotencyService";

const STATUSES = ["new", "confirmed", "packed", "shipped", "delivered", "canceled", "returned", "on_hold", "merged"];

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
};

interface OrderDetail {
  id: string;
  public_order_number: string;
  created_at: string;
  updated_at: string;
  status: string;
  payment_method: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  city: string;
  region: string;
  address_line1: string;
  address_line2: string | null;
  notes_customer: string | null;
  is_tbilisi: boolean;
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
  internal_note: string | null;
  tags: string[];
  assigned_to: string | null;
  courier_name: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  courier_status: string | null;
  is_confirmed: boolean;
  is_fulfilled: boolean;
  risk_score: number;
  risk_level: string;
  risk_reasons: string[];
  review_required: boolean;
  auto_confirmed: boolean;
  auto_confirm_reason: string | null;
  raw_city: string | null;
  raw_address: string | null;
  normalized_city: string | null;
  normalized_address: string | null;
  normalization_confidence: number | null;
  merged_into_order_id: string | null;
  merged_child_order_ids: string[] | null;
  version: number;
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

interface OrderEvent {
  id: string;
  created_at: string;
  actor: string;
  event_type: string;
  payload: Record<string, unknown>;
}

interface MergedChildInfo {
  id: string;
  public_order_number: string;
  created_at: string;
  total: number;
}

interface PreviousOrder {
  id: string;
  public_order_number: string;
  created_at: string;
  total: number;
  status: string;
  is_fulfilled: boolean;
  customer_phone: string;
  order_items: { sku: string; title: string; quantity: number }[];
}

const AdminOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromTab = searchParams.get("from") || "review";
  const { user } = useAdminAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mergedChildren, setMergedChildren] = useState<MergedChildInfo[]>([]);
  const [previousOrders, setPreviousOrders] = useState<PreviousOrder[]>([]);
  const [undoMergeOpen, setUndoMergeOpen] = useState(false);

  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [adminUsers, setAdminUsers] = useState<{ email: string }[]>([]);

  const actor = user?.email || "admin";

  const refreshOrder = async () => {
    if (!id) return;
    const [{ data: orderData }, { data: eventsData }, { data: admins }] = await Promise.all([
      supabase
        .from("orders")
        .select("*, order_items(id, title, sku, quantity, unit_price, line_total, image_url)")
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("order_events")
        .select("*")
        .eq("order_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("admin_users").select("email").eq("is_active", true),
    ]);

    if (orderData) {
      const o = orderData as unknown as OrderDetail;
      setOrder(o);
      setStatus(o.status);
      setAssignedTo(o.assigned_to || "");
      setInternalNote(o.internal_note || "");
      setCourierName(o.courier_name || "");
      setTrackingNumber(o.tracking_number || "");
      setTrackingUrl(o.tracking_url || "");

      const childIds = o.merged_child_order_ids || [];
      if (childIds.length > 0) {
        const { data: children } = await supabase
          .from("orders")
          .select("id, public_order_number, created_at, total")
          .in("id", childIds);
        setMergedChildren((children as MergedChildInfo[]) || []);
      } else {
        setMergedChildren([]);
      }

      const orConditions: string[] = [];
      if (o.customer_phone) orConditions.push(`customer_phone.eq.${o.customer_phone}`);
      if ((o as any).cookie_id_hash) orConditions.push(`cookie_id_hash.eq.${(o as any).cookie_id_hash}`);
      if (orConditions.length > 0) {
        const { data: prevOrders } = await supabase
          .from("orders")
          .select("id, public_order_number, created_at, total, status, is_fulfilled, customer_phone, order_items(sku, title, quantity)")
          .neq("id", id)
          .or(orConditions.join(","))
          .order("created_at", { ascending: false })
          .limit(10);
        setPreviousOrders((prevOrders as unknown as PreviousOrder[]) || []);
      } else {
        setPreviousOrders([]);
      }
    }
    setEvents((eventsData as unknown as OrderEvent[]) || []);
    setAdminUsers(admins || []);
    setLoading(false);
  };

  useEffect(() => { refreshOrder(); }, [id]);

  const logEvent = async (eventType: string, payload: Record<string, unknown>) => {
    await supabase.from("order_events").insert([{
      order_id: id!,
      actor,
      event_type: eventType,
      payload: payload as unknown as import("@/integrations/supabase/types").Json,
    }]);
  };

  const goBackToList = () => {
    navigate(`/admin/orders?tab=${fromTab}`);
  };

  // === DECISION ACTIONS (with audit logging) ===
  const handleConfirmOrder = async () => {
    if (!order || !id) return;
    const idemKey = crypto.randomUUID();
    setSaving(true);
    try {
      // Check idempotency
      const idemCheck = await checkIdempotency(idemKey);
      if (idemCheck.exists) {
        toast({ title: "Order already confirmed (duplicate request)" });
        await refreshOrder();
        setSaving(false);
        return;
      }

      // Versioned update
      const newVersion = await versionedOrderUpdate(id, order.version, {
        is_confirmed: true,
        status: "confirmed",
        review_required: false,
      });

      await recordIdempotency(idemKey, "ORDER_CONFIRM", id, { version: newVersion, status: "confirmed" });
      await logEvent("manual_confirm", { previous_status: order.status, previous_risk: order.risk_level });
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: "ORDER_CONFIRM", actorId: actor,
        payload: { before: { status: order.status, risk_level: order.risk_level, version: order.version }, after: { status: "confirmed", version: newVersion } },
      });
      toast({ title: "Order confirmed ✓" });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("CONFLICT")) {
        toast({ title: "Conflict", description: "Order was updated by another user. Refreshing…", variant: "destructive" });
      } else {
        await logSystemEventFailed({
          entityType: "order", entityId: id, eventType: "ORDER_CONFIRM", actorId: actor,
          errorMessage: msg,
        });
        toast({ title: "Failed to confirm order", variant: "destructive" });
      }
    }
    await refreshOrder();
    setSaving(false);
  };

  const handleKeepOnHold = async () => {
    if (!order || !id) return;
    setSaving(true);
    try {
      await versionedOrderUpdate(id, order.version, { status: "on_hold" });
      await logEvent("kept_on_hold", { previous_status: order.status });
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: "ORDER_HOLD", actorId: actor,
        payload: { before: { status: order.status }, after: { status: "on_hold" } },
      });
      toast({ title: "Order placed on hold" });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("CONFLICT")) {
        toast({ title: "Conflict", description: "Order was updated by another user. Refreshing…", variant: "destructive" });
      } else {
        await logSystemEventFailed({
          entityType: "order", entityId: id, eventType: "ORDER_HOLD", actorId: actor,
          errorMessage: msg,
        });
      }
    }
    await refreshOrder();
    setSaving(false);
  };

  const handleCancelDuplicate = async () => {
    if (!order || !id) return;
    setSaving(true);
    try {
      const newTags = [...(order.tags || [])];
      if (!newTags.includes("duplicate_confirmed")) newTags.push("duplicate_confirmed");
      await versionedOrderUpdate(id, order.version, {
        status: "canceled",
        review_required: false,
        tags: newTags,
      });
      await logEvent("canceled_duplicate", { previous_status: order.status });
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: "ORDER_CANCEL", actorId: actor,
        payload: { before: { status: order.status }, after: { status: "canceled" }, reason: "duplicate" },
      });
      toast({ title: "Order canceled as duplicate" });
      goBackToList();
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("CONFLICT")) {
        toast({ title: "Conflict", description: "Order was updated by another user. Refreshing…", variant: "destructive" });
      } else {
        await logSystemEventFailed({
          entityType: "order", entityId: id, eventType: "ORDER_CANCEL", actorId: actor,
          errorMessage: msg,
        });
      }
    }
    await refreshOrder();
    setSaving(false);
  };

  const handleToggleFulfilled = async () => {
    if (!order || !id) return;
    setSaving(true);
    const newVal = !order.is_fulfilled;
    try {
      await versionedOrderUpdate(id, order.version, { is_fulfilled: newVal });
      await logEvent("fulfillment_change", { is_fulfilled: newVal });
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: "ORDER_FULFILL_TOGGLE", actorId: actor,
        payload: { before: { is_fulfilled: order.is_fulfilled }, after: { is_fulfilled: newVal } },
      });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("CONFLICT")) {
        toast({ title: "Conflict", description: "Order was updated by another user. Refreshing…", variant: "destructive" });
      } else {
        await logSystemEventFailed({
          entityType: "order", entityId: id, eventType: "ORDER_FULFILL_TOGGLE", actorId: actor,
          errorMessage: msg,
        });
      }
    }
    await refreshOrder();
    setSaving(false);
  };

  const handleSave = async () => {
    if (!order || !id) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      const eventLogs: { type: string; payload: Record<string, unknown> }[] = [];
      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};

      if (status !== order.status) {
        updates.status = status;
        before.status = order.status;
        after.status = status;
        eventLogs.push({ type: "status_change", payload: { from: order.status, to: status } });
      }
      if (assignedTo !== (order.assigned_to || "")) {
        updates.assigned_to = assignedTo || null;
        before.assigned_to = order.assigned_to;
        after.assigned_to = assignedTo || null;
        eventLogs.push({ type: "assignment", payload: { assigned_to: assignedTo } });
      }
      if (internalNote !== (order.internal_note || "")) {
        updates.internal_note = internalNote || null;
        eventLogs.push({ type: "note", payload: { note: internalNote } });
      }
      if (courierName !== (order.courier_name || "")) updates.courier_name = courierName || null;
      if (trackingNumber !== (order.tracking_number || "")) {
        updates.tracking_number = trackingNumber || null;
        before.tracking_number = order.tracking_number;
        after.tracking_number = trackingNumber || null;
        eventLogs.push({ type: "tracking_update", payload: { tracking_number: trackingNumber, courier_name: courierName } });
      }
      if (trackingUrl !== (order.tracking_url || "")) updates.tracking_url = trackingUrl || null;

      if (Object.keys(updates).length > 0) {
        await versionedOrderUpdate(id, order.version, updates);
      }
      for (const evt of eventLogs) {
        await logEvent(evt.type, evt.payload);
      }

      // Determine the most specific event type
      const sysEventType = before.status !== undefined ? "ORDER_STATUS_SET" : "ORDER_SAVE";
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: sysEventType as any, actorId: actor,
        payload: { before, after },
      });

      toast({ title: "Changes saved" });
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes("CONFLICT")) {
        toast({ title: "Conflict", description: "Order was updated by another user. Refreshing…", variant: "destructive" });
      } else {
        await logSystemEventFailed({
          entityType: "order", entityId: id, eventType: "ORDER_SAVE", actorId: actor,
          errorMessage: msg,
        });
        toast({ title: "Failed to save changes", variant: "destructive" });
      }
    }
    await refreshOrder();
    setSaving(false);
  };

  // === UNDO MERGE ===
  const canUndoMerge = order &&
    order.tags?.includes("auto_merged") &&
    !order.is_fulfilled &&
    !["shipped", "delivered"].includes(order.status) &&
    mergedChildren.length > 0;

  const handleUndoMerge = async () => {
    if (!order || !id) return;
    setSaving(true);
    setUndoMergeOpen(false);

    const childIds = order.merged_child_order_ids || [];

    try {
      for (const childId of childIds) {
        const { data: childOrder } = await supabase
          .from("orders")
          .select("tracking_number, order_items(id)")
          .eq("id", childId)
          .maybeSingle();

        if (childOrder?.tracking_number) {
          toast({ title: "Cannot undo merge", description: "Child order has tracking number set.", variant: "destructive" });
          setSaving(false);
          return;
        }

        await supabase.from("orders").update({
          status: "new",
          is_confirmed: false,
          is_fulfilled: false,
          merged_into_order_id: null,
          internal_note: null,
          review_required: true,
        }).eq("id", childId);

        await supabase.from("order_events").insert({
          order_id: childId,
          actor,
          event_type: "undo_merge",
          payload: { primary_order_id: id, action: "child_restored" } as unknown as import("@/integrations/supabase/types").Json,
        });
      }

      const newTags = (order.tags || []).filter(t => t !== "auto_merged");
      const noteLines = (order.internal_note || "").split("\n").filter(l => !l.includes("Auto-merged"));

      await supabase.from("orders").update({
        merged_child_order_ids: [],
        tags: newTags,
        internal_note: noteLines.join("\n").trim() || null,
      }).eq("id", id);

      const { data: remainingItems } = await supabase
        .from("order_items")
        .select("line_total")
        .eq("order_id", id);
      const newSubtotal = (remainingItems || []).reduce((sum, i) => sum + Number(i.line_total), 0);
      await supabase.from("orders").update({
        subtotal: newSubtotal,
        total: newSubtotal + Number(order.shipping_fee || 0) - Number(order.discount_total || 0),
      }).eq("id", id);

      await logEvent("undo_merge", { children_restored: childIds });
      await logSystemEvent({
        entityType: "order", entityId: id, eventType: "ORDER_UNDO_MERGE", actorId: actor,
        payload: { children_restored: childIds, child_count: childIds.length },
      });
      toast({ title: "Merge undone", description: `${childIds.length} order(s) restored.` });
    } catch (err: any) {
      await logSystemEventFailed({
        entityType: "order", entityId: id, eventType: "ORDER_UNDO_MERGE", actorId: actor,
        errorMessage: err?.message || String(err),
      });
      toast({ title: "Undo merge failed", variant: "destructive" });
    }
    await refreshOrder();
    setSaving(false);
  };

  const needsReview = order && (
    ["new", "on_hold"].includes(order.status) ||
    !order.is_confirmed ||
    order.review_required
  ) && order.status !== "merged" && order.status !== "canceled";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return <div className="p-6 text-center text-muted-foreground">Order not found</div>;
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={goBackToList} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold">{order.public_order_number}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${statusColor[order.status] || "bg-muted"}`}>
          {order.status.replace("_", " ")}
        </span>
        <FulfillmentBadge isConfirmed={order.is_confirmed} isFulfilled={order.is_fulfilled} />
        <RiskBadge riskLevel={order.risk_level} riskScore={order.risk_score} />
        {order.review_required && (
          <span className="px-2 py-1 rounded text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Review Required
          </span>
        )}
        {order.auto_confirmed && (
          <span className="px-2 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-700 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Auto-confirmed
          </span>
        )}
        {order.tags?.includes("auto_merged") && (
          <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
            <GitMerge className="w-3 h-3" /> Merged Order
          </span>
        )}
        {order.status === "merged" && (
          <span className="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500 flex items-center gap-1">
            <GitMerge className="w-3 h-3" /> Merged into another order
          </span>
        )}
      </div>

      {/* Auto-confirm explanation */}
      {order.auto_confirmed && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          <span className="text-sm text-emerald-700">
            {order.auto_confirm_reason || "High confidence: clean address + no duplicate signals"}
          </span>
        </div>
      )}

      {/* Merged child banner */}
      {order.status === "merged" && order.merged_into_order_id && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-600">This order was merged into another order.</span>
          <Button variant="link" size="sm" className="h-auto p-0 text-primary" onClick={() => navigate(`/admin/orders/${order.merged_into_order_id}?from=${fromTab}`)}>
            View primary order →
          </Button>
        </div>
      )}

      {/* Decision panel */}
      {needsReview && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <h3 className="font-bold text-sm text-amber-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Decision Required
          </h3>
          {order.risk_score > 0 && (
            <div className="flex items-center gap-3 mb-2">
              <RiskBadge riskLevel={order.risk_level} riskScore={order.risk_score} />
              <div className="flex flex-wrap gap-1.5">
                {order.risk_reasons.map((reason, i) => (
                  <span key={i} className="px-2 py-0.5 rounded bg-amber-100 text-xs text-amber-800">
                    {reason}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleConfirmOrder} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <CheckCircle className="w-4 h-4" /> Confirm Order
            </Button>
            <Button onClick={handleKeepOnHold} disabled={saving} variant="outline" className="gap-2">
              <PauseCircle className="w-4 h-4" /> Keep on Hold
            </Button>
            <Button onClick={handleCancelDuplicate} disabled={saving} variant="destructive" className="gap-2">
              <XCircle className="w-4 h-4" /> Cancel as Duplicate
            </Button>
          </div>
        </div>
      )}

      {/* Merged orders panel */}
      {mergedChildren.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <GitMerge className="w-4 h-4 text-slate-500" /> Merged Orders ({mergedChildren.length})
            </h3>
            {canUndoMerge && (
              <Button variant="outline" size="sm" className="gap-1.5 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={() => setUndoMergeOpen(true)} disabled={saving}>
                <Undo2 className="w-3.5 h-3.5" /> Undo Merge
              </Button>
            )}
            {order.is_fulfilled && (
              <span className="text-xs text-muted-foreground">Cannot undo after fulfillment</span>
            )}
          </div>
          <div className="space-y-1.5">
            {mergedChildren.map((child) => (
              <div key={child.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-background border border-border text-sm">
                <button className="font-bold text-primary hover:underline" onClick={() => navigate(`/admin/orders/${child.id}?from=${fromTab}`)}>
                  #{child.public_order_number}
                </button>
                <span className="text-muted-foreground">
                  {new Date(child.created_at).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="font-medium">{Number(child.total).toFixed(1)} ₾</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Previous orders */}
      {previousOrders.length > 0 && (
        <div className="bg-card rounded-lg p-4 border border-border space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" /> Previous Orders from This Customer ({previousOrders.length})
          </h3>
          <div className="space-y-1.5">
            {previousOrders.map((prev) => (
              <div key={prev.id} className="flex items-center justify-between py-2 px-3 rounded bg-muted/30 border border-border text-sm">
                <button className="font-bold text-primary hover:underline" onClick={() => navigate(`/admin/orders/${prev.id}?from=${fromTab}`)}>
                  #{prev.public_order_number}
                </button>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${statusColor[prev.status] || "bg-muted text-foreground"}`}>
                  {prev.status.replace("_", " ")}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(prev.created_at).toLocaleDateString("ka-GE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                  {prev.order_items?.map(i => `${i.title} ×${i.quantity}`).join(", ")}
                </span>
                <span className="font-medium">{Number(prev.total).toFixed(1)} ₾</span>
                {prev.is_fulfilled && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700">Fulfilled</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-10 px-3 rounded-lg border border-border bg-card text-sm font-medium">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Assign to</Label>
          <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="h-10 px-3 rounded-lg border border-border bg-card text-sm">
            <option value="">Unassigned</option>
            {adminUsers.map((a) => (
              <option key={a.email} value={a.email}>{a.email}</option>
            ))}
          </select>
        </div>
        <Button onClick={handleSave} disabled={saving} className="h-10">
          <Save className="w-4 h-4 mr-1" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
        <Button onClick={goBackToList} variant="outline" className="h-10">
          Back to List
        </Button>
      </div>

      {/* Fulfill actions */}
      {order.is_confirmed && order.status !== "merged" && (
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleToggleFulfilled} disabled={saving} variant="outline" className="gap-2">
            {order.is_fulfilled ? "Unmark Fulfilled" : "Mark Fulfilled"}
          </Button>
        </div>
      )}

      {/* Risk card */}
      {order.risk_score > 0 && !needsReview && (
        <div className="bg-card rounded-lg p-4 border border-amber-200 space-y-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600" /> Risk Assessment
          </h3>
          <div className="flex items-center gap-3">
            <RiskBadge riskLevel={order.risk_level} riskScore={order.risk_score} />
            <span className="text-sm text-muted-foreground">Score: {order.risk_score}</span>
          </div>
          {order.risk_reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {order.risk_reasons.map((reason, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-muted text-xs text-muted-foreground">{reason}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <EditableOrderFields orderId={id!} order={order} actor={actor} onSaved={refreshOrder} />

      {/* Editable Items */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <h3 className="font-bold text-sm mb-3">Items</h3>
        <div className="space-y-2">
          {order.order_items.map((item) => (
            <EditableItemRow
              key={item.id}
              item={item}
              orderId={id!}
              actor={actor}
              canEdit={!order.is_fulfilled && !["shipped", "delivered", "canceled", "returned", "merged"].includes(order.status)}
              onUpdated={refreshOrder}
            />
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-1.5">
        <div className="flex justify-between text-sm"><span>Subtotal</span><span>{Number(order.subtotal).toFixed(1)} ₾</span></div>
        <div className="flex justify-between text-sm"><span>Shipping</span><span>{Number(order.shipping_fee).toFixed(1)} ₾</span></div>
        <div className="flex justify-between text-sm"><span>Discount</span><span>-{Number(order.discount_total).toFixed(1)} ₾</span></div>
        <div className="flex justify-between font-bold border-t border-border pt-1.5"><span>Total</span><span>{Number(order.total).toFixed(1)} ₾</span></div>
      </div>

      {/* Fulfillment & Tracking */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <h3 className="font-bold text-sm">Fulfillment & Tracking</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Courier</Label>
            <Input value={courierName} onChange={(e) => setCourierName(e.target.value)} className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Tracking #</Label>
            <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} className="h-10" />
          </div>
          <div>
            <Label className="text-xs">Tracking URL</Label>
            <Input value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} className="h-10" />
          </div>
        </div>
      </div>

      {/* Internal note */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-2">
        <Label className="text-xs font-bold">Internal Note</Label>
        <textarea
          value={internalNote}
          onChange={(e) => setInternalNote(e.target.value)}
          className="w-full h-20 rounded-lg border border-border px-3 py-2 text-sm resize-none bg-background"
          placeholder="Add internal note..."
        />
      </div>

      {/* Timeline */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <h3 className="font-bold text-sm">Timeline</h3>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events yet</p>
        ) : (
          <div className="space-y-2">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">
                    {new Date(evt.created_at).toLocaleString("ka-GE")} — <span className="font-medium">{evt.actor}</span>
                  </p>
                  <p className="text-sm font-medium capitalize">{evt.event_type.replace(/_/g, " ")}</p>
                  {evt.payload && Object.keys(evt.payload).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {JSON.stringify(evt.payload)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Undo Merge Dialog */}
      <AlertDialog open={undoMergeOpen} onOpenChange={setUndoMergeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo Merge</AlertDialogTitle>
            <AlertDialogDescription>
              This will restore {mergedChildren.length} child order(s) and recalculate totals. The restored orders will appear in "Needs Review". Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUndoMerge}>Undo Merge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminOrderDetail;
