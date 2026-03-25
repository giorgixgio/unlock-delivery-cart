import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, MapPin } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { updateOrderAddress } from "@/lib/orderService";
import { trackAddressFormViewed, trackAddressSubmitted, trackAddressAbandoned } from "@/lib/funnelTracking";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions } from "@/lib/addressPredictor";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";

const addressSchema = z.object({
  region: z.string().trim().min(1, "ქალაქი აუცილებელია").max(100),
  address: z.string().trim().min(1, "მისამართი აუცილებელია").max(300),
});

interface AddressFormModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  orderTotal: number;
  deliveryFee: number;
  productId: string;
  quantity: number;
  unitPrice: number;
  landingSlug: string;
  onComplete: () => void;
}

const AddressFormModal = ({
  open,
  onClose,
  orderId,
  orderNumber,
  orderTotal,
  deliveryFee,
  productId,
  quantity,
  unitPrice,
  landingSlug,
  onComplete,
}: AddressFormModalProps) => {
  const [form, setForm] = useState({ region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);
  const submittedRef = useRef(false);

  // Track form view
  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    trackAddressFormViewed(orderId);
    const saved = loadCustomerInfo();
    if (saved) {
      setForm((f) => ({
        ...f,
        region: saved.region || f.region,
        address: saved.address || f.address,
      }));
    }
  }, [open]);

  // Track abandonment on close without submit
  const handleClose = () => {
    if (!submittedRef.current) {
      trackAddressAbandoned(orderId);
    }
    onClose();
  };

  // Fetch historical data
  useEffect(() => {
    if (!open) return;
    const fetchData = async () => {
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
    fetchData();
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
  };

  const handleSubmit = async () => {
    const result = addressSchema.safeParse(form);
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
      const saved = loadCustomerInfo();
      saveCustomerInfo({ phone: saved?.phone || "", region: form.region, address: form.address });

      const isTbilisi = form.region.trim().toLowerCase() === "თბილისი" || form.region.trim().toLowerCase() === "tbilisi";

      await updateOrderAddress(orderId, {
        city: form.region,
        region: form.region,
        addressLine1: form.address,
        isTbilisi,
      });

      submittedRef.current = true;

      // Track address submitted (NO Meta Purchase here — already fired on phone submit)
      trackAddressSubmitted(orderId, form.region);

      onComplete();
    } catch (err: any) {
      console.error("Address update failed:", err);
      setErrors({ _form: "მისამართის შენახვა ვერ მოხერხდა. სცადეთ თავიდან." });
    } finally {
      setSubmitting(false);
    }
  };

  const finalTotal = orderTotal + deliveryFee;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[92vh] rounded-t-2xl overflow-y-auto pb-8"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetTitle className="text-lg font-extrabold text-foreground mb-1">
          დაასრულე შეკვეთა
        </SheetTitle>
        <p className="text-sm text-muted-foreground mb-1">მიუთითე მიტანის მისამართი</p>
        <p className="text-xs text-muted-foreground mb-4">ოპერატორი დაგიკავშირდებათ შეკვეთის დასადასტურებლად</p>

        {/* Order total display */}
        <div className="flex items-center gap-2 bg-accent/40 rounded-xl px-4 py-3 mb-4">
          <MapPin className="w-5 h-5 text-primary flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">შეკვეთა #{orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              ჯამი: <span className="font-bold text-primary">{finalTotal.toFixed(2)} ₾</span>
              {deliveryFee > 0 && ` (მიწოდება: ${deliveryFee} ₾)`}
              {deliveryFee === 0 && " (უფასო მიწოდება)"}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-3">
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
            `დაასრულე შეკვეთა — ${finalTotal.toFixed(2)} ₾`
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
};

export default AddressFormModal;
