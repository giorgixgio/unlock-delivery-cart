import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Phone, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { createOrder } from "@/lib/orderService";
import { buildScratchGiftItems, SCRATCH_GIFT_SKU, SCRATCH_PROMO } from "@/lib/scratchGift";
import type { Product } from "@/lib/constants";
import { STANDARD_SHIPPING_FEE, normalizeOrderAmounts } from "@/lib/orderPricing";

interface Lead { id: string; phone: string; created_at: string; status: string; note: string | null; is_test: boolean; landing_slug: string | null; order_id: string | null }
const STATUSES = [["new", "ახალი"], ["called", "დავურეკე"], ["no_answer", "არ პასუხობს"], ["declined", "უარი"], ["ordered", "შეუკვეთა"]] as const;

/** Scratch-card phone leads (not orders) for operators to call. */
export default function ScratchLeadsTab() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTest, setShowTest] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = (supabase as any).from("scratch_leads").select("id, phone, created_at, status, note, is_test, landing_slug, order_id")
      .in("status", ["new", "called", "no_answer"]).order("created_at", { ascending: false }).limit(300);
    if (!showTest) q = q.eq("is_test", false);
    const { data, error } = await q;
    if (error) toast({ title: "ვერ ჩაიტვირთა", description: error.message, variant: "destructive" });
    setRows(data || []);
    setLoading(false);
  }, [showTest, toast]);
  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, values: Partial<Lead>) => {
    const { error } = await (supabase as any).from("scratch_leads").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "ვერ შეინახა", description: error.message, variant: "destructive" }); return false; }
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...values } : x)).filter((x) => ["new", "called", "no_answer"].includes(x.status)));
    return true;
  };

  const createFor = async (lead: Lead) => {
    if (!window.confirm(`შეკვეთის შექმნა ${lead.phone}: ხის დისკი × 1 + 1 🎁 საჩუქარი?`)) return;
    setBusy(lead.id);
    try {
      const { data: p, error } = await supabase.from("products").select("id, sku, title, price, image, handle").eq("sku", SCRATCH_GIFT_SKU).maybeSingle();
      if (error || !p) throw new Error("პროდუქტი ვერ მოიძებნა");
      const product = { id: p.id, sku: p.sku, title: p.title, price: Number(p.price), image: p.image || "", handle: p.handle || "" } as unknown as Product;
      const amounts = normalizeOrderAmounts(product.price, STANDARD_SHIPPING_FEE);
      const order = await createOrder({
        customerName: lead.phone, customerPhone: lead.phone,
        items: buildScratchGiftItems(product, 1, true),
        subtotal: amounts.subtotal, total: amounts.total, shippingFee: amounts.shippingFee,
        source: "scratch_lead", landingSlug: lead.landing_slug || undefined, status: "new",
        promo: SCRATCH_PROMO, testOrder: lead.is_test,
      });
      await patch(lead.id, { status: "ordered", order_id: order.id });
      toast({ title: `შეკვეთა #${order.public_order_number} შეიქმნა` });
      navigate(`/admin/orders/${order.id}`);
    } catch (e: any) {
      toast({ title: "შეკვეთა ვერ შეიქმნა", description: e?.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <div className="space-y-3 mt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">ნომრები გადაფხეკის ბარათიდან — ჯერ არ შეუკვეთავთ. ეს შეკვეთები არ არის.</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold"><Switch checked={showTest} onCheckedChange={setShowTest} /> ტესტის ჩვენება</label>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
        </div>
      </div>
      {loading ? <div className="flex justify-center p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>
        : rows.length === 0 ? <p className="p-6 text-center text-muted-foreground">დასარეკი ლიდი არ არის</p>
        : rows.map((l) => (
          <div key={l.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <a href={`tel:+995${l.phone}`} className="flex items-center gap-2 text-lg font-extrabold text-primary"><Phone className="w-5 h-5" />{l.phone}</a>
              <span className="text-sm text-muted-foreground">{new Date(l.created_at).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })}{l.is_test && " · TEST"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select aria-label="სტატუსი" value={l.status} onChange={(e) => void patch(l.id, { status: e.target.value })}
                className="h-10 rounded-md border border-input bg-background px-2 text-base">
                {STATUSES.filter(([v]) => v !== "ordered").map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
              <Input defaultValue={l.note || ""} placeholder="შენიშვნა" className="h-10 flex-1 min-w-[160px] text-base"
                onBlur={(e) => { const v = e.target.value.trim().slice(0, 500); if (v !== (l.note || "")) void patch(l.id, { note: v || null }); }} />
              <Button onClick={() => createFor(l)} disabled={busy === l.id} className="h-10">{busy === l.id ? <Loader2 className="w-4 h-4 animate-spin" /> : "შეკვეთის შექმნა"}</Button>
            </div>
          </div>
        ))}
    </div>
  );
}
