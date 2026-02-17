import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Truck, Loader2 } from "lucide-react";
import { z } from "zod";
import { Product } from "@/lib/constants";
import { supabase } from "@/integrations/supabase/client";
import { getCookieIdHash, getUserAgent } from "@/lib/identitySignals";
import { logSystemEvent, logSystemEventFailed } from "@/lib/systemEventService";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions } from "@/lib/addressPredictor";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";

const formSchema = z.object({
  name: z.string().trim().min(1, "სახელი აუცილებელია").max(100),
  phone: z.string().trim().min(5, "ტელეფონი აუცილებელია").max(20),
  region: z.string().trim().min(1, "ქალაქი აუცილებელია").max(100),
  address: z.string().trim().min(1, "მისამართი აუცილებელია").max(300),
});

interface CODFormModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  quantity: number;
  discountPct: number;
  landingSlug: string;
  landingVariant: string;
  bumpEnabled: boolean;
  onOrderCreated: (orderId: string, orderNumber: string, orderTotal: number) => void;
}

const CODFormModal = ({
  open,
  onClose,
  product,
  quantity,
  discountPct,
  landingSlug,
  landingVariant,
  bumpEnabled,
  onOrderCreated,
}: CODFormModalProps) => {
  const [form, setForm] = useState({ name: "", phone: "", region: "", address: "", comment: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);

  const unitPrice = product.price;
  const totalBefore = unitPrice * quantity;
  const totalAfter = totalBefore * (1 - discountPct / 100);

  // Load saved customer info
  useEffect(() => {
    if (!open) return;
    const saved = loadCustomerInfo();
    if (saved) {
      setForm((f) => ({
        ...f,
        name: saved.name || f.name,
        phone: saved.phone || f.phone,
        region: saved.region || f.region,
        address: saved.address || f.address,
      }));
    }
  }, [open]);

  // Fetch historical data for predictions
  useEffect(() => {
    if (!open) return;
    const fetch = async () => {
      try {
        const [{ data: cities }, { data: addresses }] = await Promise.all([
          supabase
            .from("orders")
            .select("normalized_city")
            .not("normalized_city", "is", null)
            .neq("normalized_city", "")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("orders")
            .select("normalized_address")
            .not("normalized_address", "is", null)
            .neq("normalized_address", "")
            .order("created_at", { ascending: false })
            .limit(200),
        ]);
        if (cities) setHistoricalCities([...new Set(cities.map((c) => c.normalized_city).filter(Boolean) as string[])]);
        if (addresses) setHistoricalAddresses([...new Set(addresses.map((a) => a.normalized_address).filter(Boolean) as string[])]);
      } catch {}
    };
    fetch();
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  const handleSubmit = async () => {
    const result = formSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    try {
      saveCustomerInfo(form);

      const isTbilisi = form.region.trim().toLowerCase() === "თბილისი" || form.region.trim().toLowerCase() === "tbilisi";
      const status = bumpEnabled ? "pending_bump" : "new";

      // Create order directly
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          customer_name: form.name,
          customer_phone: form.phone,
          city: form.region,
          region: form.region,
          address_line1: form.address,
          is_tbilisi: isTbilisi,
          subtotal: totalAfter,
          total: totalAfter,
          status,
          payment_method: "COD",
          public_order_number: "",
          raw_city: form.region,
          raw_address: form.address,
          cookie_id_hash: getCookieIdHash(),
          user_agent: getUserAgent(),
          source: "landing_cod",
          notes_customer: form.comment || null,
          tags: [`landing:${landingSlug}`, `variant:${landingVariant}`],
        } as any)
        .select("id, public_order_number")
        .single();

      if (orderError) throw orderError;

      // Insert order item
      await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: product.id,
        sku: product.sku || product.id,
        title: product.title,
        quantity,
        unit_price: unitPrice,
        line_total: totalAfter,
        image_url: product.image || "",
      });

      // Create initial event
      await supabase.from("order_events").insert({
        order_id: order.id,
        actor: "system",
        event_type: "status_change",
        payload: {
          from: null,
          to: status,
          source: "landing_cod",
          bundle_qty: quantity,
          bundle_discount_pct: discountPct,
          unit_price_snapshot: unitPrice,
          total_price_snapshot: totalAfter,
          landing_slug: landingSlug,
          landing_variant: landingVariant,
        },
      });

      await logSystemEvent({
        entityType: "order",
        entityId: order.id,
        eventType: "ORDER_CREATE",
        actorId: "landing_cod",
        payload: {
          public_order_number: order.public_order_number,
          total: totalAfter,
          landing_slug: landingSlug,
          bundle_qty: quantity,
        },
      });

      // Fire-and-forget normalize
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        fetch(`${supabaseUrl}/functions/v1/normalize-and-score`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ order_id: order.id }),
        });
      } catch {}

      onOrderCreated(order.id, order.public_order_number, totalAfter);
    } catch (err: any) {
      console.error("COD order failed:", err);
      setErrors({ _form: "შეკვეთა ვერ შეიქმნა. სცადეთ თავიდან." });
      await logSystemEventFailed({
        entityType: "order",
        entityId: "unknown",
        eventType: "ORDER_CREATE",
        actorId: "landing_cod",
        errorMessage: err?.message || String(err),
        payload: { customer_phone: form.phone, total: totalAfter },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] rounded-t-2xl overflow-y-auto pb-8">
        <SheetTitle className="text-lg font-extrabold text-foreground mb-4">
          შეკვეთის გაფორმება
        </SheetTitle>

        {/* Order summary */}
        <div className="bg-accent/40 rounded-xl p-3 mb-4 flex items-center gap-3">
          <img src={product.image} alt={product.title} className="w-14 h-14 rounded-lg object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{product.title}</p>
            <p className="text-xs text-muted-foreground">
              {quantity} ცალი × {unitPrice} ₾
              {discountPct > 0 && ` (-${discountPct}%)`}
            </p>
          </div>
          <p className="text-lg font-extrabold text-primary">{totalAfter.toFixed(2)} ₾</p>
        </div>

        {/* COD badge */}
        <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-4">
          <Truck className="w-4 h-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">გადახდა მიტანისას — კურიერთან</span>
        </div>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <Label className="text-sm font-bold text-foreground">სახელი</Label>
            <Input
              placeholder="თქვენი სახელი"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
              className="mt-1 h-12 text-base rounded-lg"
            />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground">ტელეფონი</Label>
            <Input
              type="tel"
              placeholder="5XX XXX XXX"
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="mt-1 h-12 text-base rounded-lg"
            />
            {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground">ქალაქი / რეგიონი</Label>
            <div className="mt-1">
              <PredictiveInput
                value={form.region}
                onChange={(val) => handleChange("region", val)}
                onSelect={(s) => handleChange("region", s.text)}
                getSuggestions={(input) => getCitySuggestions(input, historicalCities)}
                placeholder="მაგ: თბილისი"
                error={errors.region}
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground">მისამართი</Label>
            <div className="mt-1">
              <PredictiveInput
                value={form.address}
                onChange={(val) => handleChange("address", val)}
                onSelect={(s) => handleChange("address", s.text)}
                getSuggestions={(input) => getAddressSuggestions(input, form.region, historicalAddresses)}
                placeholder="ქუჩა, სახლი, ბინა"
                error={errors.address}
              />
            </div>
          </div>
          <div>
            <Label className="text-sm font-bold text-foreground">კომენტარი (არასავალდებულო)</Label>
            <Input
              placeholder="დამატებითი ინფორმაცია..."
              value={form.comment}
              onChange={(e) => handleChange("comment", e.target.value)}
              className="mt-1 h-12 text-base rounded-lg"
            />
          </div>
        </div>

        {errors._form && (
          <p className="text-sm text-destructive mt-3 text-center">{errors._form}</p>
        )}

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full h-14 text-lg font-bold rounded-xl mt-4 bg-success hover:bg-success/90 text-success-foreground"
          size="lg"
        >
          {submitting ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              იგზავნება...
            </>
          ) : (
            `შეკვეთა — ${totalAfter.toFixed(2)} ₾`
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export default CODFormModal;
