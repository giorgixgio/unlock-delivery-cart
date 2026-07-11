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

const schema = z.object({
  region: z.string().trim().max(100),
  address: z.string().trim().max(300),
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

// Sticky orange announcement bar height (28px per Fix #1) + safe area + breathing room
const TOP_SAFE_PADDING = "calc(28px + env(safe-area-inset-top) + 18px)";
const BOTTOM_SAFE_PADDING = "calc(150px + env(safe-area-inset-bottom))";

const inputClass =
  "h-[58px] !text-[17px] rounded-2xl border-[1.5px] border-border px-[18px] focus-visible:ring-2 focus-visible:ring-success/40 focus-visible:border-success";

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
  const [emptyWarning, setEmptyWarning] = useState(false);
  const [savedAddress, setSavedAddress] = useState<{ region: string; address: string } | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    submittedRef.current = false;
    setView("form");
    setPartialWarning(false);
    setEmptyWarning(false);
    setSavedAddress(null);
    trackAddressFormViewed(orderId);
    trackAddressPopupOpened(orderId);
    const saved = loadCustomerInfo();
    if (saved) {
      setForm((f) => ({
        ...f,
        region: saved.region || f.region,
        address: saved.address || f.address,
      }));
      if (saved.region && saved.address) {
        setSavedAddress({ region: saved.region, address: saved.address });
      }
    }
  }, [open, orderId]);

  // Returning-customer lookup by phone from the just-created order.
  // If we have a previous address on file, pre-fill and show a summary card
  // so the user sees "we already have your address" and can confirm/edit.
  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data: current } = await supabase
          .from("orders")
          .select("customer_phone")
          .eq("id", orderId)
          .maybeSingle();
        const phone = (current?.customer_phone || "").replace(/\D/g, "");
        if (!phone || phone.length < 6) return;
        const { data } = await (supabase as any).rpc("storefront_get_last_address_by_phone", {
          p_phone: phone,
        });
        const prev = Array.isArray(data) ? data[0] : data;
        if (cancelled || !prev) return;
        const region = prev.normalized_city || prev.region || prev.city || "";
        const address = prev.normalized_address || prev.address_line1 || "";
        if (!region && !address) return;
        setSavedAddress({ region, address });
        setForm((f) => ({
          ...f,
          region: f.region.trim() || region,
          address: f.address.trim() || address,
        }));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [open, orderId]);


  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [{ data: cities }, { data: addresses }] = await Promise.all([
          (supabase as any).rpc("storefront_recent_cities", { p_limit: 200 }),
          (supabase as any).rpc("storefront_recent_addresses", { p_limit: 200 }),
        ]);
        if (cities) setHistoricalCities([...new Set((cities as any[]).map((c) => c.city).filter(Boolean) as string[])]);
        if (addresses) setHistoricalAddresses([...new Set((addresses as any[]).map((a) => a.address).filter(Boolean) as string[])]);
      } catch {}
    })();
  }, [open]);

  const handleChange = (field: string, value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: "" }));
    if (value.trim()) setEmptyWarning(false);
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
    try { await markOrderAddressSkipped(orderId); } catch {}
    trackAddressSkipped(orderId);
    trackAddressAbandoned(orderId);
    onClose();
  };

  const handleSubmit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.errors.forEach((e) => { if (e.path[0]) fe[e.path[0] as string] = e.message; });
      setErrors(fe);
      return;
    }

    const region = form.region.trim();
    const addressLine = form.address.trim();

    // Both empty → gentle nudge, no hard error
    if (!region && !addressLine) {
      setEmptyWarning(true);
      return;
    }

    const hasFullAddress = !!region && !!addressLine;

    // Only city → gentle warning first, allow on second tap
    if (!hasFullAddress && !!region && !addressLine && !partialWarning) {
      setPartialWarning(true);
      return;
    }

    setSubmitting(true);
    try {
      const saved = loadCustomerInfo();
      saveCustomerInfo({ phone: saved?.phone || "", region, address: addressLine });

      const isTbilisi = ["თბილისი", "tbilisi"].includes(region.toLowerCase());

      await updateOrderAddress(orderId, {
        city: region,
        region: region,
        addressLine1: addressLine,
        isTbilisi,
        addressStatus: hasFullAddress ? "completed" : "partial",
      });

      submittedRef.current = true;

      trackAddressSubmitted(orderId, region);
      if (hasFullAddress) trackAddressCompleted(orderId, region);
      else trackAddressPartialCompleted(orderId, region);

      setView("success");
      setTimeout(() => onComplete(), 1900);
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
        className="h-[100dvh] max-h-[100dvh] rounded-t-3xl p-0 overflow-hidden flex flex-col [&>button.absolute]:hidden border-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Soft close (X) */}
        {view !== "success" && (
          <button
            onClick={requestClose}
            aria-label="დახურვა"
            className="fixed z-[2] w-9 h-9 rounded-full text-muted-foreground/70 hover:text-foreground hover:bg-muted/70 flex items-center justify-center transition-colors bg-background/80 backdrop-blur-sm"
            style={{
              top: "calc(28px + env(safe-area-inset-top) + 10px)",
              right: "14px",
            }}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto relative">

        {/* Scroll container with safe-area padding */}
        <div
          className="mx-auto w-full"
          style={{
            maxWidth: 480,
            paddingTop: TOP_SAFE_PADDING,
            paddingBottom: BOTTOM_SAFE_PADDING,
            paddingLeft: 20,
            paddingRight: 20,
            boxSizing: "border-box",
            overflowX: "hidden",
          }}
        >
          {view === "form" && (
            <>
              {/* Reassurance line */}
              <div className="mb-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 px-3 py-1.5">
                <p className="text-[12px] font-semibold text-emerald-800 dark:text-emerald-300 leading-snug">
                  შეკვეთა #{orderNumber} დადასტურებულია ✅ — გადაიხდი მიღებისას
                </p>
              </div>

              {/* Step label + progress bar */}
              <div className="pb-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  ნაბიჯი 2/2
                </p>
                <div className="mt-2 h-[5px] w-full rounded-full bg-muted overflow-hidden relative">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 relative overflow-hidden"
                    style={{ width: "100%" }}
                  >
                    <span className="absolute inset-y-0 w-1/3 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent animate-shine" />
                  </div>
                </div>
              </div>

              <SheetTitle
                className="font-extrabold text-foreground mt-2 leading-[1.18] flex items-center gap-2 flex-wrap"
                style={{ fontSize: "clamp(22px, 5.6vw, 30px)" }}
              >
                შეკვეთა მიღებულია <span className="text-emerald-500">✅</span>
              </SheetTitle>
              <p
                className="text-muted-foreground mt-2"
                style={{ fontSize: "clamp(14px, 3.8vw, 16px)", lineHeight: 1.35 }}
              >
                მისამართის დამატება აჩქარებს მიწოდებას. ჩაწერე ქალაქი და მისამართი, რომ ოპერატორმა უფრო სწრაფად დაადასტუროს შეკვეთა.
              </p>

              {/* Order summary card */}
              <div
                className="mt-4 rounded-[20px] bg-card"
                style={{
                  border: "1px solid hsl(var(--border))",
                  padding: "18px 20px",
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground text-[15px]">შეკვეთა #{orderNumber}</span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700">COD</span>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-[14px] text-muted-foreground">
                    <span>ჯამი</span>
                    <span className="text-foreground font-semibold">{orderTotal.toFixed(2)} ₾</span>
                  </div>
                  <div className="flex items-center justify-between text-[14px] text-muted-foreground">
                    <span>მიწოდება</span>
                    <span className="text-foreground font-semibold">
                      {deliveryFee > 0 ? `${deliveryFee.toFixed(2)} ₾` : "უფასო"}
                    </span>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
                  <span className="font-bold text-foreground text-[15px]">გადასახდელია</span>
                  <span className="font-extrabold text-[20px]" style={{ color: "#ff6a00" }}>
                    {finalTotal.toFixed(2)} ₾
                  </span>
                </div>
              </div>

              {/* Returning customer summary card */}
              {savedAddress && (savedAddress.region || savedAddress.address) && (
                <div className="mt-4 rounded-[20px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-4">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-[1px]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-emerald-800 dark:text-emerald-300">
                        შენი მისამართი უკვე გვაქვს
                      </p>
                      <p className="text-[14px] text-foreground mt-1 leading-snug break-words">
                        {savedAddress.region}
                        {savedAddress.region && savedAddress.address ? ", " : ""}
                        {savedAddress.address}
                      </p>
                      <p className="text-[12px] text-muted-foreground mt-1">
                        თუ სხვა ადგილას გინდა მიწოდება, შეცვალე ქვემოთ.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fields */}
              <div className="space-y-4 mt-5">

                <div>
                  <Label className="text-[14px] font-bold text-foreground">ქალაქი / რეგიონი</Label>
                  <div className="mt-1.5">
                    <PredictiveInput
                      value={form.region}
                      onChange={(val) => handleChange("region", val)}
                      onSelect={(s) => handleChange("region", s.text)}
                      getSuggestions={(input) => getCitySuggestions(input, historicalCities)}
                      placeholder="მაგ: თბილისი / ქუთაისი / ზუგდიდი"
                      error={errors.region}
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[14px] font-bold text-foreground">მისამართი</Label>
                  <div className="mt-1.5">
                    <PredictiveInput
                      value={form.address}
                      onChange={(val) => handleChange("address", val)}
                      onSelect={(s) => handleChange("address", s.text)}
                      getSuggestions={(input) => getAddressSuggestions(input, form.region, historicalAddresses)}
                      placeholder="ქუჩა, კორპუსი, ბინა ან სოფელი"
                      error={errors.address}
                      className={inputClass}
                    />
                  </div>
                  <p
                    className="mt-2 flex items-start gap-1.5"
                    style={{ fontSize: 14, color: "#777", lineHeight: 1.3 }}
                  >
                    <Zap className="w-4 h-4 text-amber-500 flex-shrink-0 mt-[1px]" />
                    <span>მისამართის დამატებით შეკვეთა უფრო სწრაფად მუშავდება</span>
                  </p>
                </div>
              </div>

              {emptyWarning && (
                <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300 leading-snug">
                  ჩაწერე ქალაქი ან მისამართი, რომ შეკვეთა უფრო სწრაფად დამუშავდეს.
                </div>
              )}
              {partialWarning && (
                <div className="mt-3 rounded-xl border border-amber-400/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2 text-[13px] text-amber-700 dark:text-amber-300 leading-snug">
                  სრული მისამართი მიწოდებას უფრო აჩქარებს. გსურს გაგრძელება მხოლოდ ქალაქით? დააჭირე ღილაკს კიდევ ერთხელ.
                </div>
              )}
              {errors._form && (
                <p className="text-sm text-destructive mt-3 text-center">{errors._form}</p>
              )}

            </>
          )}

          {view === "skip_confirm" && (
            <div className="py-8 text-center space-y-4 animate-fade-in">
              <SheetTitle className="text-[22px] font-extrabold text-foreground">
                მისამართის გარეშე გააგრძელო?
              </SheetTitle>
              <p className="text-[15px] text-muted-foreground leading-snug px-2">
                მისამართის დამატება მიწოდებას აჩქარებს, თუმცა ოპერატორი მაინც დაგიკავშირდება დასადასტურებლად.
              </p>
              <div className="space-y-2 pt-2">
                <Button
                  onClick={() => setView("form")}
                  className="w-full font-extrabold rounded-[20px] bg-success hover:bg-success/90 text-success-foreground"
                  style={{ minHeight: 64, fontSize: "clamp(16px, 4.4vw, 20px)" }}
                >
                  მისამართის დამატება
                </Button>
                <Button
                  onClick={handleSkipConfirm}
                  variant="ghost"
                  className="w-full h-11 text-[14px] text-muted-foreground"
                >
                  გამოტოვება
                </Button>
              </div>
            </div>
          )}

          {view === "success" && (
            <div className="py-14 text-center space-y-3 animate-fade-in">
              <div className="mx-auto w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-success" />
              </div>
              <SheetTitle className="text-[22px] font-extrabold text-foreground">
                მისამართი დამატებულია ✅
              </SheetTitle>
              <p className="text-[15px] text-muted-foreground px-4 leading-snug">
                შეკვეთა სწრაფად დამუშავდება და ოპერატორი მალე დაგიკავშირდებათ.
              </p>
            </div>
          )}
        </div>

        {/* Sticky footer with primary CTA */}
        {view === "form" && (
          <div
            className="sticky bottom-0 left-0 right-0 z-10 bg-background border-t border-border px-5 pt-3"
            style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
          >
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full font-extrabold rounded-[20px] bg-success hover:bg-success/90 text-success-foreground"
              style={{
                minHeight: 66,
                height: "auto",
                padding: "10px 18px",
                fontSize: "clamp(16px, 4.4vw, 20px)",
                lineHeight: 1.15,
                whiteSpace: "normal",
                overflowWrap: "anywhere",
                textAlign: "center",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxSizing: "border-box",
              }}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  იგზავნება...
                </>
              ) : (
                <span>მისამართის დამატება და დასრულება</span>
              )}
            </Button>

            <button
              type="button"
              onClick={requestClose}
              className="block mx-auto mt-3 text-[13px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
            >
              გამოტოვება — ოპერატორი დაგიკავშირდებათ
            </button>
          </div>
        )}
      </div>
      </SheetContent>
    </Sheet>
  );
};

export default AddressFormModal;
