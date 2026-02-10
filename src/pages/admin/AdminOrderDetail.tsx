import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, MapPin, User, Phone, Mail, Save } from "lucide-react";

const STATUSES = ["new", "confirmed", "packed", "shipped", "delivered", "canceled", "returned", "on_hold"];

const statusColor: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  packed: "bg-amber-100 text-amber-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  canceled: "bg-red-100 text-red-800",
  returned: "bg-gray-100 text-gray-800",
  on_hold: "bg-orange-100 text-orange-800",
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

const AdminOrderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAdminAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [status, setStatus] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [adminUsers, setAdminUsers] = useState<{ email: string }[]>([]);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const [{ data: orderData }, { data: eventsData }, { data: admins }] = await Promise.all([
        supabase
          .from("orders")
          .select("*, order_items(id, title, sku, quantity, unit_price, line_total, image_url)")
          .eq("id", id)
          .single(),
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
      }
      setEvents((eventsData as unknown as OrderEvent[]) || []);
      setAdminUsers(admins || []);
      setLoading(false);
    };
    fetch();
  }, [id]);

  const logEvent = async (eventType: string, payload: Record<string, unknown>) => {
    await supabase.from("order_events").insert([{
      order_id: id!,
      actor: user?.email || "admin",
      event_type: eventType,
      payload: payload as unknown as import("@/integrations/supabase/types").Json,
    }]);
  };

  const handleSave = async () => {
    if (!order || !id) return;
    setSaving(true);

    const updates: Record<string, unknown> = {};
    const eventLogs: { type: string; payload: Record<string, unknown> }[] = [];

    if (status !== order.status) {
      updates.status = status;
      eventLogs.push({ type: "status_change", payload: { from: order.status, to: status } });
    }
    if (assignedTo !== (order.assigned_to || "")) {
      updates.assigned_to = assignedTo || null;
      eventLogs.push({ type: "assignment", payload: { assigned_to: assignedTo } });
    }
    if (internalNote !== (order.internal_note || "")) {
      updates.internal_note = internalNote || null;
      eventLogs.push({ type: "note", payload: { note: internalNote } });
    }
    if (courierName !== (order.courier_name || "")) updates.courier_name = courierName || null;
    if (trackingNumber !== (order.tracking_number || "")) {
      updates.tracking_number = trackingNumber || null;
      eventLogs.push({ type: "tracking_update", payload: { tracking_number: trackingNumber, courier_name: courierName } });
    }
    if (trackingUrl !== (order.tracking_url || "")) updates.tracking_url = trackingUrl || null;

    if (Object.keys(updates).length > 0) {
      await supabase.from("orders").update(updates).eq("id", id);
    }

    for (const evt of eventLogs) {
      await logEvent(evt.type, evt.payload);
    }

    // Refresh
    const { data } = await supabase
      .from("orders")
      .select("*, order_items(id, title, sku, quantity, unit_price, line_total, image_url)")
      .eq("id", id)
      .single();
    if (data) setOrder(data as unknown as OrderDetail);

    const { data: evData } = await supabase
      .from("order_events")
      .select("*")
      .eq("order_id", id)
      .order("created_at", { ascending: false });
    setEvents((evData as unknown as OrderEvent[]) || []);

    setSaving(false);
  };

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
      <div className="flex items-center gap-4">
        <button onClick={() => navigate("/admin/orders")} className="p-1">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-extrabold">{order.public_order_number}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${statusColor[order.status] || "bg-muted"}`}>
          {order.status.replace("_", " ")}
        </span>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <Label className="text-xs">Status</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-10 px-3 rounded-lg border border-border bg-card text-sm font-medium"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Assign to</Label>
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="h-10 px-3 rounded-lg border border-border bg-card text-sm"
          >
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
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer card */}
        <div className="bg-card rounded-lg p-4 border border-border space-y-2">
          <h3 className="font-bold text-sm flex items-center gap-2"><User className="w-4 h-4" /> Customer</h3>
          <p className="text-sm">{order.customer_name}</p>
          <p className="text-sm flex items-center gap-1"><Phone className="w-3 h-3" /> {order.customer_phone}</p>
          {order.customer_email && (
            <p className="text-sm flex items-center gap-1"><Mail className="w-3 h-3" /> {order.customer_email}</p>
          )}
        </div>

        {/* Shipping address */}
        <div className="bg-card rounded-lg p-4 border border-border space-y-2">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Shipping
            {order.is_tbilisi && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800">Tbilisi</span>
            )}
          </h3>
          <p className="text-sm">{order.city} {order.region}</p>
          <p className="text-sm">{order.address_line1}</p>
          {order.address_line2 && <p className="text-sm">{order.address_line2}</p>}
          {order.notes_customer && (
            <p className="text-xs text-muted-foreground italic">"{order.notes_customer}"</p>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="bg-card rounded-lg p-4 border border-border">
        <h3 className="font-bold text-sm mb-3">Items</h3>
        <div className="space-y-2">
          {order.order_items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <div className="w-10 h-10 rounded border border-border overflow-hidden flex-shrink-0">
                <img src={item.image_url} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{item.title}</p>
                <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
              </div>
              <div className="text-sm text-right">
                <p>{item.quantity} × {Number(item.unit_price).toFixed(1)} ₾</p>
                <p className="font-bold">{Number(item.line_total).toFixed(1)} ₾</p>
              </div>
            </div>
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

      {/* Fulfillment / Tracking */}
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
                  <p className="text-sm font-medium capitalize">{evt.event_type.replace("_", " ")}</p>
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
    </div>
  );
};

export default AdminOrderDetail;
