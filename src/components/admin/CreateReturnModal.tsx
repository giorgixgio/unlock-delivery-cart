import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Minus, Plus, Trash2, Search, RotateCcw } from "lucide-react";
import { logSystemEvent } from "@/lib/systemEventService";

export const RETURN_DEFAULT_NOTE = "გაცვლა";

interface DraftItem {
  key: string;
  product_id: string | null;
  sku: string;
  title: string;
  quantity: number;
  unit_price: number;
  image_url: string;
}

interface Props {
  open: boolean;
  orderId: string;
  actor: string;
  onClose: () => void;
  onCreated?: (newOrderId: string, newOrderNumber: string) => void;
}

interface ProductRow {
  id: string;
  title: string;
  sku: string;
  price: number;
  image: string;
}

export default function CreateReturnModal({ open, orderId, actor, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [source, setSource] = useState<any>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [totalPrice, setTotalPrice] = useState("0");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState(RETURN_DEFAULT_NOTE);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select(
          "id, public_order_number, customer_name, customer_phone, customer_email, city, region, address_line1, address_line2, raw_city, raw_address, normalized_city, normalized_address, is_tbilisi, notes_customer, order_items(id, product_id, title, sku, quantity, unit_price, image_url)"
        )
        .eq("id", orderId)
        .single();
      if (cancelled) return;
      setSource(data);
      setItems(
        ((data as any)?.order_items || []).map((it: any, i: number) => ({
          key: `src-${it.id ?? i}`,
          product_id: it.product_id,
          sku: it.sku,
          title: it.title,
          quantity: it.quantity,
          unit_price: Number(it.unit_price),
          image_url: it.image_url || "",
        }))
      );
      setTotalPrice("0");
      setReason("");
      setNote(RETURN_DEFAULT_NOTE);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data } = await supabase
      .from("products")
      .select("id, title, sku, price, image")
      .or(`title.ilike.%${q}%,sku.ilike.%${q}%`)
      .limit(8);
    setResults((data as ProductRow[]) || []);
    setSearching(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const addProduct = (p: ProductRow) => {
    setItems((prev) => [
      ...prev,
      {
        key: `new-${p.id}-${Date.now()}`,
        product_id: p.id,
        sku: p.sku || p.id,
        title: p.title,
        quantity: 1,
        unit_price: Number(p.price || 0),
        image_url: p.image || "",
      },
    ]);
    setQuery("");
    setResults([]);
  };

  const setQty = (key: string, qty: number) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, quantity: Math.max(1, qty) } : i)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  const handleSave = async () => {
    if (items.length === 0) {
      toast({ title: "დაამატე მინიმუმ ერთი პროდუქტი", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const total = Number(totalPrice) || 0;
      const { data: created, error } = await supabase
        .from("orders")
        .insert({
          public_order_number: "",
          status: "return_review",
          is_return: true,
          original_order_id: source.id,
          return_reason: reason || null,
          internal_note: note || null,
          payment_method: "COD",
          source: "return",
          channel: "admin",
          customer_name: source.customer_name,
          customer_phone: source.customer_phone,
          customer_email: source.customer_email,
          city: source.city || "",
          region: source.region || "",
          address_line1: source.address_line1 || "",
          address_line2: source.address_line2,
          raw_city: source.raw_city,
          raw_address: source.raw_address,
          normalized_city: source.normalized_city,
          normalized_address: source.normalized_address,
          is_tbilisi: !!source.is_tbilisi,
          subtotal: total,
          shipping_fee: 0,
          discount_total: 0,
          total,
          is_confirmed: false,
          is_fulfilled: false,
          address_status: "completed",
          tags: ["return"],
        } as any)
        .select("id, public_order_number")
        .single();
      if (error) throw error;

      const { error: itemsError } = await supabase.from("order_items").insert(
        items.map((i) => ({
          order_id: created.id,
          product_id: i.product_id || i.sku,
          sku: i.sku,
          title: i.title,
          quantity: i.quantity,
          unit_price: i.unit_price,
          line_total: i.unit_price * i.quantity,
          image_url: i.image_url || "",
        }))
      );
      if (itemsError) throw itemsError;

      await supabase.from("order_events").insert({
        order_id: created.id,
        actor,
        event_type: "return_created",
        payload: { original_order_id: source.id, original_order_number: source.public_order_number, reason, total } as any,
      });
      await logSystemEvent({
        entityType: "order",
        entityId: created.id,
        eventType: "ORDER_CREATE",
        actorId: actor,
        payload: { is_return: true, original_order_id: source.id, total },
      });

      toast({ title: `დაბრუნება შექმნილია #${created.public_order_number}` });
      onCreated?.(created.id, created.public_order_number);
      onClose();
    } catch (e: any) {
      toast({ title: "ვერ შეიქმნა", description: e?.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={onClose}>
      <div
        className="bg-background w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-background border-b border-border px-4 py-3 flex items-center gap-2">
          <RotateCcw className="w-4 h-4 text-amber-600" />
          <h2 className="font-extrabold">Create Return / Replacement</h2>
          {source?.public_order_number && (
            <span className="text-xs text-muted-foreground">from #{source.public_order_number}</span>
          )}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="font-bold">{source?.customer_name}</div>
              <div className="text-muted-foreground">{source?.customer_phone}</div>
              <div className="text-muted-foreground">
                {source?.city} — {source?.address_line1}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">პროდუქტები</Label>
              <div className="mt-2 space-y-2">
                {items.map((it) => (
                  <div key={it.key} className="flex items-center gap-2 border border-border rounded-lg p-2">
                    <div className="w-9 h-9 rounded border border-border overflow-hidden flex-shrink-0">
                      {it.image_url && <img src={it.image_url} alt="" className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{it.title}</div>
                      <div className="text-xs text-muted-foreground">SKU {it.sku}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(it.key, it.quantity - 1)}>
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="w-7 text-center font-bold text-sm">{it.quantity}</span>
                      <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setQty(it.key, it.quantity + 1)}>
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(it.key)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
                {items.length === 0 && <p className="text-xs text-muted-foreground py-2">პროდუქტი არ არის</p>}
              </div>

              <div className="mt-3 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="პროდუქტის ძებნა (title / SKU)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
                {(searching || results.length > 0) && (
                  <div className="absolute z-10 mt-1 w-full bg-popover border border-border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {searching && <div className="p-3 text-xs text-muted-foreground">იძებნება…</div>}
                    {results.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => addProduct(p)}
                        className="w-full flex items-center gap-2 p-2 hover:bg-muted text-left"
                      >
                        <div className="w-8 h-8 rounded overflow-hidden border border-border flex-shrink-0">
                          {p.image && <img src={p.image} alt="" className="w-full h-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{p.title}</div>
                          <div className="text-xs text-muted-foreground">
                            SKU {p.sku} · {Number(p.price).toFixed(1)} ₾
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">ჯამური ფასი (₾)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.1"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">მიზეზი</Label>
                <Input
                  placeholder="მაგ. არასწორი ნივთი, დაზიანებული"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold uppercase text-muted-foreground">ოპერატორის შენიშვნა (CSV → O)</Label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
                გაუქმება
              </Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "შენახვა"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
