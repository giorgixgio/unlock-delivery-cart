import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw, Plus, Minus, Trash2, Search, AlertTriangle } from "lucide-react";
import LandingQtyDiscountActions from "@/components/admin/LandingQtyDiscountActions";
import { getTieredLineTotal, getTieredUnitPrice } from "@/lib/landingDiscounts";
import { markAction } from "@/lib/operatorSession";

export interface EditorItem {
  id: string;
  product_id: string | null;
  title: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  image_url: string;
}

export interface EditorOrder {
  id: string;
  order_items: EditorItem[];
  subtotal: number;
  shipping_fee: number;
  discount_total: number;
  total: number;
}

interface ProductSearchResult { id: string; title: string; sku: string; price: number; image: string; available: boolean }

interface Props {
  order: EditorOrder;
  actor: string;
  saving: boolean;
  /** Called after items/totals were rewritten in the DB. */
  onChanged: (patch: { order_items: EditorItem[]; subtotal: number; total: number }) => void;
  onCreateReturn: () => void;
}

/** Product list editor shared by the quick-review pop-up and the Call Queue. Remount (key) per order. */
export default function OrderItemsEditor({ order, actor, saving, onChanged, onCreateReturn }: Props) {
  const { toast } = useToast();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const refreshItemsAndTotals = useCallback(async () => {
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_id, title, sku, quantity, unit_price, line_total, image_url")
      .eq("order_id", order.id);
    const list = (items || []) as EditorItem[];
    const newSubtotal = list.reduce((s, i) => s + Number(i.line_total), 0);
    const shipping = Number(order.shipping_fee || 0);
    const discount = Number(order.discount_total || 0);
    const newTotal = newSubtotal + shipping - discount;
    await supabase.from("orders").update({ subtotal: newSubtotal, total: newTotal }).eq("id", order.id);
    onChanged({ order_items: list, subtotal: newSubtotal, total: newTotal });
  }, [order.id, order.shipping_fee, order.discount_total, onChanged]);

  const changeItemQty = async (item: EditorItem, nextQty: number) => {
    if (nextQty < 1) return;
    let basePrice = Number(item.unit_price);
    const { data: prod } = await supabase.from("products").select("price").eq("sku", item.sku).limit(1).maybeSingle();
    if (prod?.price != null) basePrice = Number(prod.price);
    const newLineTotal = getTieredLineTotal(basePrice, nextQty, item.sku);
    const newUnitPrice = getTieredUnitPrice(basePrice, nextQty, item.sku);
    const { error } = await supabase
      .from("order_items")
      .update({ quantity: nextQty, line_total: newLineTotal, unit_price: newUnitPrice })
      .eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({
      order_id: order.id, actor, event_type: "item_quantity_change",
      payload: { item_id: item.id, sku: item.sku, from: item.quantity, to: nextQty } as any,
    });
    markAction("item_quantity_change");
    await refreshItemsAndTotals();
  };

  const removeItem = async (item: EditorItem) => {
    if (!confirm(`${item.title} — წავშალო შეკვეთიდან?`)) return;
    const { error } = await supabase.from("order_items").delete().eq("id", item.id);
    if (error) { toast({ title: "Failed", variant: "destructive" }); return; }
    await supabase.from("order_events").insert({
      order_id: order.id, actor, event_type: "item_removed",
      payload: { item_id: item.id, sku: item.sku, title: item.title } as any,
    });
    markAction("item_removed");
    await refreshItemsAndTotals();
    toast({ title: "წაიშალა" });
  };

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
    const existing = order.order_items.find((i) => i.product_id === p.id || i.sku === p.sku);
    if (existing) {
      await changeItemQty(existing, existing.quantity + 1);
      toast({ title: "პროდუქტი უკვე იყო — რაოდენობა გაიზარდა" });
    } else {
      const newLine = Number(p.price);
      const { error } = await supabase.from("order_items").insert({
        order_id: order.id, product_id: p.id, sku: p.sku || p.id, title: p.title,
        quantity: 1, unit_price: p.price, line_total: newLine, image_url: p.image || "",
      });
      if (error) { toast({ title: "Add failed", description: error.message, variant: "destructive" }); return; }
      await supabase.from("order_events").insert({
        order_id: order.id, actor, event_type: "item_added",
        payload: { product_id: p.id, sku: p.sku, title: p.title, quantity: 1, unit_price: Number(p.price), added_revenue: Number(p.price) } as any,
      });
      markAction("item_added");
      await refreshItemsAndTotals();
      toast({ title: `დაემატა: ${p.title}` });
    }
    setSearchTerm("");
    setSearchResults([]);
  };

  return (
    <section className="rounded-lg border border-border p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">პროდუქტები</h3>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={onCreateReturn}>
            <RotateCcw className="w-3.5 h-3.5" /> Make Replacement
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 h-8" onClick={() => setSearchOpen((v) => !v)}>
            <Plus className="w-3.5 h-3.5" /> პროდუქტის დამატება
          </Button>
        </div>
      </div>

      {searchOpen && (
        <div className="mb-3 rounded-md border border-dashed border-border p-2 bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input autoFocus placeholder="ძებნა SKU, სახელი ან ID…" value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-border/60">
            {searching && <div className="py-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> ვძებნი…</div>}
            {!searching && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
              <div className="py-3 text-center text-xs text-muted-foreground">ვერ მოიძებნა</div>
            )}
            {searchResults.map((p) => (
              <button key={p.id} type="button" onClick={() => addProduct(p)}
                className="w-full flex items-center gap-2 py-2 px-1 hover:bg-background rounded text-left">
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

      {order.order_items && order.order_items.length === 1 && (
        <LandingQtyDiscountActions
          orderId={order.id}
          items={order.order_items.map((it) => ({
            id: it.id, sku: it.sku, title: it.title, quantity: it.quantity,
            unit_price: Number(it.unit_price), line_total: Number(it.line_total),
          }))}
          actor={actor}
          disabled={saving}
          onApplied={refreshItemsAndTotals}
        />
      )}

      <div className="mt-3 pt-3 border-t border-border space-y-1 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{Number(order.subtotal).toFixed(1)} ₾</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">მიწოდება</span><span>{Number(order.shipping_fee).toFixed(1)} ₾</span></div>
        <div className="flex justify-between font-bold text-base"><span>სულ</span><span>{Number(order.total).toFixed(1)} ₾</span></div>
      </div>
    </section>
  );
}
