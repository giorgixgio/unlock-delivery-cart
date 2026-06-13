import { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, X, Zap } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { updateOrderAddress, markOrderAddressSkipped } from "@/lib/orderService";
import {
  trackAddressFormViewed,
  trackAddressSubmitted,
  trackAddressAbandoned,
  trackAddressPopupOpened,
  trackAddressCompleted,
  trackAddressPartialCompleted,
  trackAddressSkipped,
  trackAddressPopupClosed,
} from "@/lib/funnelTracking";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions } from "@/lib/addressPredictor";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";

const cityOnlySchema = z.object({
  region: z.string().trim().min(1, "ქალაქი აუცილებელია").max(100),
  address: z.string().trim().max(300).optional().or(z.literal("")),
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

type View = "form" | "skip_confirm" | "success";

const AddressFormModal = ({
  open,
  onClose,
  orderId,
  orderNumber,
  orderTotal,
  deliveryFee,
  onComplete,
}: AddressFormModalProps) => {
  const [form, setForm] = useState({ region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);
  const [view, setView] = useState<View>("form");
  const [partialWarning, setPartialWarning] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    setView("form");
    setPartialWarning(false);
    trackAddressFormViewed(orderId);
    trackAddressPopupOpened(orderId);
    const saved = loadCustomerInfo();
    if (saved) {
      setForm((f) => ({
        ...f,
        region: saved.region || f.region,
        address: saved.address || f.address,
      }));
    }
  }, [open, orderId]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [{ data: cities }, { data: addresses }] = await Promise.all([
          supabase.from("orders").select("normalized_city").not("normalized_city", "is", null).neq("normalized_city", "").order("created_at", { ascending: false }).limit(200),
          supabase.from("orders").select("normalized_address").not("normalized_address", "is", null).neq("normalized_address", "").order("created_at", { ascending: false }).limit(200),
        ]);
        if (cities) setHistoricalCities([...new Set(cities.map((c) => c.normalized_city).filter(Boolean) as string[])]);
        if (addresses) setHistoricalAddresses([...new Set(addresses.map((a) => a.normalized_address).filter(Boolean) as string[])]);
      } catch {}
    })();
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
    if (field === "address" && value.trim()) setPartialWarning(false);
  };

  const requestClose = () => {
    if (submittedRef.current || view === "success") {
      onClose();
      return;
    }
    trackAddressPopupClosed(orderId, "x_button");
    setView("skip_confirm");
  };

  const handleSkipConfirm = async () => {
    try {
      await markOrderAddressSkipped(orderId);
    } catch (e) {
      console.warn("markOrderAddressSkipped failed:", e);
    }
    trackAddressSkipped(orderId);
    trackAddressAbandoned(orderId);
    onClose();
  };

  const handleSubmit = async () => {
    const result = cityOnlySchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const hasFullAddress = !!form.address.trim();

    // Gentle warning on first attempt with only city
    if (!hasFullAddress && !partialWarning) {
      setPartialWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const saved = loadCustomerInfo();
      saveCustomerInfo({ phone: saved?.phone || "", region: form.region, address: form.address });

      const isTbilisi = ["თბილისი", "tbilisi"].includes(form.region.trim().toLowerCase());

      await updateOrderAddress(orderId, {
        city: form.region,
        region: form.region,
        addressLine1: form.address,
        isTbilisi,
        addressStatus: hasFullAddress ? "completed" : "partial",
      });

      submittedRef.current = true;

      trackAddressSubmitted(orderId, form.region);
      if (hasFullAddress) trackAddressCompleted(orderId, form.region);
      else trackAddressPartialCompleted(orderId, form.region);

      setView("success");
      setTimeout(() => onComplete(), 1800);
    } catch (err: any) {
      console.error("Address update failed:", err);
      setErrors({ _form: "მისამართის შენახვა ვერ მოხერხდა. სცადეთ თავიდან." });
    } finally {
      setSubmitting(false);
    }
  };

  const finalTotal = orderTotal + deliveryFee;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[94vh] rounded-t-3xl overflow-y-auto pb-8 px-5 [&>button.absolute]:hidden"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >

        {/* ----- Soft X close (top-right) ----- */}
        {view !== "success" && (
          <button
            onClick={requestClose}
            aria-label="დახურვა"
            className="absolute top-3 right-3 w-7 h-7 rounded-full text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {view === "form" && (
          <>
            {/* Step indicator + progress */}
            <div className="pt-2 pb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                ნაბიჯი 2/2 — მიწოდების მისამართი
              </p>
              <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden relative">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 relative overflow-hidden"
                  style={{ width: "82%" }}
                >
                  <span className="absolute inset-y-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent animate-[shine_1.8s_ease-in-out_infinite]" />
                </div>
              </div>
            </div>

            <SheetTitle className="text-xl font-extrabold text-foreground mt-1 flex items-center gap-2">
              შეკვეთა მიღებულია <span className="text-emerald-500">✅</span>
            </SheetTitle>
            <p className="text-sm text-muted-foreground mt-1 leading-snug">
              მისამართის დამატება აჩქარებს მიწოდებას. ჩაწერე ქალაქი და მისამართი, რომ ოპერატორმა უფრო სწრაფად დაადასტუროს შეკვეთა.
            </p>

            {/* Order summary card */}
            <div className="mt-4 rounded-2xl border border-border bg-accent/40 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">შეკვეთა #{orderNumber}</span>
                <span className="text-xs text-muted-foreground">COD</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>ჯამი</span>
                <span>{orderTotal.toFixed(2)} ₾</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>მიწოდება</span>
                <span>{deliveryFee > 0 ? `${deliveryFee.toFixed(2)} ₾` : "უფასო"}</span>
              </div>
              <div className="flex items-center justify-between text-sm pt-1 border-t border-border/60 mt-1">
                <span className="font-bold text-foreground">გადასახდელია</span>
                <span className="font-extrabold text-primary">{finalTotal.toFixed(2)} ₾</span>
              </div>
            </div>

            {/* Fields */}
            <div className="space-y-3 mt-4">
              <div>
                <Label className="text-sm font-bold text-foreground">ქალაქი / რეგიონი</Label>
                <div className="mt-1">
                  <PredictiveInput
                    value={form.region}
                    onChange={(val) => handleChange("region", val)}
                    onSelect={(s) => handleChange("region", s.text)}
                    getSuggestions={(input) => getCitySuggestions(input, historicalCities)}
                    placeholder="მაგ: თბილისი / ქუთაისი / ზუგდიდი"
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
                    placeholder="ქუჩა, კორპუსი, ბინა ან სოფელი"
                    error={errors.address}
                  />
                </div>
              </div>
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              მისამართის დამატებით შეკვეთა უფრო სწრაფად მუშავდება
            </p>

            {partialWarning && (
              <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                სრული მისამართი მიწოდებას უფრო აჩქარებს. გსურს გაგრძელება მხოლოდ ქალაქით? დააჭირე ღილაკს კიდევ ერთხელ.
              </div>
            )}

            {errors._form && (
              <p className="text-sm text-destructive mt-3 text-center">{errors._form}</p>
            )}

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 text-base font-bold rounded-2xl mt-4 bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  იგზავნება...
                </>
              ) : (
                <span className="leading-tight text-center">
                  მისამართის დამატება და შეკვეთის დასრულება — {finalTotal.toFixed(2)} ₾
                </span>
              )}
            </Button>
          </>
        )}

        {view === "skip_confirm" && (
          <div className="py-6 text-center space-y-4 animate-fade-in">
            <SheetTitle className="text-xl font-extrabold text-foreground">გამოტოვება გსურს?</SheetTitle>
            <p className="text-sm text-muted-foreground leading-snug px-2">
              მისამართის დამატება აჩქარებს მიწოდებას, თუმცა ოპერატორი მაინც დაგიკავშირდება დასადასტურებლად.
            </p>
            <div className="space-y-2 pt-2">
              <Button
                onClick={() => setView("form")}
                className="w-full h-13 rounded-2xl font-bold bg-success hover:bg-success/90 text-success-foreground"
                size="lg"
              >
                მისამართის დამატება
              </Button>
              <Button
                onClick={handleSkipConfirm}
                variant="ghost"
                className="w-full h-11 text-sm text-muted-foreground"
              >
                გამოტოვება
              </Button>
            </div>
          </div>
        )}

        {view === "success" && (
          <div className="py-10 text-center space-y-3 animate-fade-in">
            <div className="mx-auto w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-success" />
            </div>
            <SheetTitle className="text-xl font-extrabold text-foreground">
              მადლობა! შეკვეთა დასრულებულია ✅
            </SheetTitle>
            <p className="text-sm text-muted-foreground px-4">
              ოპერატორი მალე დაგიკავშირდებათ დასადასტურებლად.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default AddressFormModal;
