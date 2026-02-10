import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Pencil, Save, X, RotateCcw, Loader2 } from "lucide-react";

interface EditableOrderFieldsProps {
  orderId: string;
  order: {
    customer_name: string;
    customer_phone: string;
    raw_city: string | null;
    normalized_city: string | null;
    raw_address: string | null;
    normalized_address: string | null;
    address_line1: string;
    address_line2: string | null;
    city: string;
    notes_customer: string | null;
    internal_note: string | null;
    normalization_confidence: number | null;
    review_required: boolean;
  };
  actor: string;
  onSaved: () => void;
}

const EditableOrderFields = ({ orderId, order, actor, onSaved }: EditableOrderFieldsProps) => {
  const { toast } = useToast();
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renormalizing, setRenormalizing] = useState(false);

  // Customer fields
  const [customerName, setCustomerName] = useState(order.customer_name);
  const [customerPhone, setCustomerPhone] = useState(order.customer_phone);
  const [notesCustomer, setNotesCustomer] = useState(order.notes_customer || "");
  const [internalNote, setInternalNote] = useState(order.internal_note || "");

  // Address fields
  const [city, setCity] = useState(order.city);
  const [rawCity, setRawCity] = useState(order.raw_city || "");
  const [normalizedCity, setNormalizedCity] = useState(order.normalized_city || "");
  const [rawAddress, setRawAddress] = useState(order.raw_address || "");
  const [normalizedAddress, setNormalizedAddress] = useState(order.normalized_address || "");
  const [addressLine1, setAddressLine1] = useState(order.address_line1);
  const [addressLine2, setAddressLine2] = useState(order.address_line2 || "");

  const resetCustomer = () => {
    setCustomerName(order.customer_name);
    setCustomerPhone(order.customer_phone);
    setNotesCustomer(order.notes_customer || "");
    setInternalNote(order.internal_note || "");
    setEditingCustomer(false);
  };

  const resetAddress = () => {
    setCity(order.city);
    setRawCity(order.raw_city || "");
    setNormalizedCity(order.normalized_city || "");
    setRawAddress(order.raw_address || "");
    setNormalizedAddress(order.normalized_address || "");
    setAddressLine1(order.address_line1);
    setAddressLine2(order.address_line2 || "");
    setEditingAddress(false);
  };

  const saveCustomer = async () => {
    setSaving(true);
    const changedFields: Record<string, { old: string; new: string }> = {};
    const updates: Record<string, unknown> = {};

    if (customerName !== order.customer_name) {
      changedFields.customer_name = { old: order.customer_name, new: customerName };
      updates.customer_name = customerName;
    }
    if (customerPhone !== order.customer_phone) {
      changedFields.customer_phone = { old: order.customer_phone, new: customerPhone };
      updates.customer_phone = customerPhone;
    }
    if (notesCustomer !== (order.notes_customer || "")) {
      changedFields.notes_customer = { old: order.notes_customer || "", new: notesCustomer };
      updates.notes_customer = notesCustomer || null;
    }
    if (internalNote !== (order.internal_note || "")) {
      changedFields.internal_note = { old: order.internal_note || "", new: internalNote };
      updates.internal_note = internalNote || null;
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("orders").update(updates).eq("id", orderId);
      await supabase.from("order_events").insert({
        order_id: orderId,
        actor,
        event_type: "manual_edit",
        payload: { section: "customer", changed_fields: changedFields } as any,
      });
      toast({ title: "Customer info saved ✓" });
      onSaved();
    }
    setEditingCustomer(false);
    setSaving(false);
  };

  const saveAddress = async () => {
    setSaving(true);
    const changedFields: Record<string, { old: string; new: string }> = {};
    const updates: Record<string, unknown> = {};

    const fields = [
      { key: "city", cur: city, orig: order.city },
      { key: "raw_city", cur: rawCity, orig: order.raw_city || "" },
      { key: "normalized_city", cur: normalizedCity, orig: order.normalized_city || "" },
      { key: "raw_address", cur: rawAddress, orig: order.raw_address || "" },
      { key: "normalized_address", cur: normalizedAddress, orig: order.normalized_address || "" },
      { key: "address_line1", cur: addressLine1, orig: order.address_line1 },
      { key: "address_line2", cur: addressLine2, orig: order.address_line2 || "" },
    ];

    for (const f of fields) {
      if (f.cur !== f.orig) {
        changedFields[f.key] = { old: f.orig, new: f.cur };
        updates[f.key] = f.cur || null;
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("orders").update(updates).eq("id", orderId);
      await supabase.from("order_events").insert({
        order_id: orderId,
        actor,
        event_type: "manual_edit",
        payload: { section: "address", changed_fields: changedFields } as any,
      });
      toast({ title: "Address saved ✓" });
      onSaved();
    }
    setEditingAddress(false);
    setSaving(false);
  };

  const handleReNormalize = async () => {
    setRenormalizing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/normalize-and-score`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ order_id: orderId }),
      });
      if (res.ok) {
        toast({ title: "Re-normalization complete ✓" });
        onSaved();
      } else {
        toast({ title: "Re-normalization failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Re-normalization failed", variant: "destructive" });
    }
    setRenormalizing(false);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Customer card */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Customer</h3>
          {!editingCustomer ? (
            <Button variant="ghost" size="sm" onClick={() => setEditingCustomer(true)} className="gap-1 h-7 text-xs">
              <Pencil className="w-3 h-3" /> Edit
            </Button>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={resetCustomer} className="h-7 text-xs gap-1">
                <X className="w-3 h-3" /> Cancel
              </Button>
              <Button size="sm" onClick={saveCustomer} disabled={saving} className="h-7 text-xs gap-1">
                <Save className="w-3 h-3" /> Save
              </Button>
            </div>
          )}
        </div>

        {editingCustomer ? (
          <div className="space-y-2">
            <div><Label className="text-xs">Name</Label><Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Phone</Label><Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Customer Notes</Label><textarea value={notesCustomer} onChange={e => setNotesCustomer(e.target.value)} className="w-full h-16 rounded border border-border px-2 py-1 text-sm resize-none bg-background" /></div>
            <div><Label className="text-xs">Internal Note</Label><textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} className="w-full h-16 rounded border border-border px-2 py-1 text-sm resize-none bg-background" /></div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm">{order.customer_name}</p>
            <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
            {order.notes_customer && <p className="text-xs text-muted-foreground italic">"{order.notes_customer}"</p>}
          </div>
        )}
      </div>

      {/* Address card */}
      <div className="bg-card rounded-lg p-4 border border-border space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm">Address</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleReNormalize} disabled={renormalizing} className="h-7 text-xs gap-1">
              {renormalizing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              Re-normalize
            </Button>
            {!editingAddress ? (
              <Button variant="ghost" size="sm" onClick={() => setEditingAddress(true)} className="gap-1 h-7 text-xs">
                <Pencil className="w-3 h-3" /> Edit
              </Button>
            ) : (
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={resetAddress} className="h-7 text-xs gap-1">
                  <X className="w-3 h-3" /> Cancel
                </Button>
                <Button size="sm" onClick={saveAddress} disabled={saving} className="h-7 text-xs gap-1">
                  <Save className="w-3 h-3" /> Save
                </Button>
              </div>
            )}
          </div>
        </div>

        {editingAddress ? (
          <div className="space-y-2">
            <div><Label className="text-xs">City</Label><Input value={city} onChange={e => setCity(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Raw City</Label><Input value={rawCity} onChange={e => setRawCity(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Normalized City</Label><Input value={normalizedCity} onChange={e => setNormalizedCity(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Address Line 1</Label><Input value={addressLine1} onChange={e => setAddressLine1(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Raw Address</Label><Input value={rawAddress} onChange={e => setRawAddress(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Normalized Address</Label><Input value={normalizedAddress} onChange={e => setNormalizedAddress(e.target.value)} className="h-8" /></div>
            <div><Label className="text-xs">Address Line 2</Label><Input value={addressLine2} onChange={e => setAddressLine2(e.target.value)} className="h-8" /></div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{order.normalized_city || order.city}</p>
            <p className="text-sm">{order.normalized_address || order.address_line1}</p>
            {order.raw_city && order.normalized_city && order.raw_city !== order.normalized_city && (
              <p className="text-xs text-muted-foreground">Raw city: {order.raw_city}</p>
            )}
            {order.raw_address && order.normalized_address && order.raw_address !== order.normalized_address && (
              <p className="text-xs text-muted-foreground">Raw addr: {order.raw_address}</p>
            )}
            {order.normalization_confidence != null && order.normalization_confidence < 1 && (
              <p className="text-xs text-muted-foreground">Confidence: {(order.normalization_confidence * 100).toFixed(0)}%</p>
            )}
            {order.address_line2 && <p className="text-sm">{order.address_line2}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default EditableOrderFields;
