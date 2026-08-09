import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2, Check } from "lucide-react";
import { Product } from "@/lib/constants";
import { submitCustomerOrder } from "@/lib/orderService";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";
import { trackPhoneFormViewed, trackPhoneSubmitted } from "@/lib/funnelTracking";
import { consumeIntentionalRepeat } from "@/lib/lastOrderStore";
import { trackEvent } from "@/lib/analytics";
import { cleanPhoneInput, isValidGeorgianMobile } from "@/lib/phoneValidation";


interface BundlePhoneSheetProps {
  open: boolean;
  onClose: () => void;
  products: Product[];
  /** Flat charged total for the whole bundle (e.g. 39). */
  flatTotal: number;
  landingSlug: string;
  onOrderCreated: (orderId: string, orderNumber: string, total: number) => void;
  onDuplicateBlocked?: (orderNumber: string, createdAt: string) => void;
}

/** Phone-capture sheet for the bundle route. Delegates order creation to the
 *  shared submitCustomerOrder() so dedupe + SMS + events behave identically. */
const BundlePhoneSheet = ({
  open,
  onClose,
  products,
  flatTotal,
  landingSlug,
  onOrderCreated,
  onDuplicateBlocked,
}: BundlePhoneSheetProps) => {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const cleanedPhone = cleanPhoneInput(phone);
  const isValid = isValidGeorgianMobile(cleanedPhone);
  const showInlineError = touched && !isValid && cleanedPhone.length > 0;
  const anchorSum = products.reduce((s, p) => s + p.price, 0);

  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setTouched(false);
      return;
    }
    const saved = loadCustomerInfo();
    if (saved?.phone) setPhone(cleanPhoneInput(saved.phone));
    if (products[0]) trackPhoneFormViewed(products[0].id);
  }, [open]);

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid || products.length === 0) return;
    const submitPhone = cleanedPhone;

    setSubmitting(true);
    setError("");
    try {
      saveCustomerInfo({ phone: submitPhone, region: "", address: "" });

      const primarySku = products[0].sku || products[0].id;
      const intentionalRepeat = consumeIntentionalRepeat(primarySku);

      const result = await submitCustomerOrder({
        debugLabel: "Bundle 5x39 order submit",
        intentionalRepeat,
        order: {
          customerName: submitPhone,
          customerPhone: submitPhone,
          items: products.map((product) => ({ product, quantity: 1 })),
          // Flat bundle price — individual prices are display-only anchors.
          subtotal: flatTotal,
          shippingFee: 0,
          total: flatTotal,
          source: "landing_cod",
          landingSlug,
          status: "pending_details",
        },
      });

      if (result.kind === "stockout") {
        setError("ზოგიერთი პროდუქტი აღარ არის მარაგში. აირჩიე სხვა.");
        return;
      }

      if (result.kind === "duplicate") {
        trackEvent("duplicate_block_shown", {
          sku: primarySku,
          orderNumber: result.orderNumber,
          source: "server",
        });
        onDuplicateBlocked?.(result.orderNumber, result.createdAt);
        onClose();
        return;
      }

      const { order } = result;

      trackPhoneSubmitted({
        orderId: order.id,
        orderNumber: order.public_order_number,
        productId: products[0].id,
        productName: `Bundle 5x${flatTotal}`,
        baseValue: flatTotal,
        landingSlug,
      });

      setSuccess(true);
      setTimeout(() => {
        onOrderCreated(order.id, order.public_order_number, flatTotal);
      }, 600);
    } catch (err) {
      console.error("Bundle order failed:", err);
      setError("შეკვეთა ვერ შეიქმნა. სცადეთ თავიდან.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[88vh] rounded-t-2xl overflow-y-auto"
        style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
      >
        {success ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <CheckCircle2 className="w-14 h-14 text-success animate-bounce" />
            <p className="text-lg font-extrabold text-foreground">✔️ შეკვეთა დაფიქსირდა</p>
          </div>
        ) : (
          <>
            <SheetTitle className="text-xl font-extrabold text-foreground mb-1">
              შეუკვეთე 1 წუთში
            </SheetTitle>
            <p className="text-sm text-muted-foreground mb-4">მხოლოდ ტელეფონის ნომერი</p>

            {/* Bundle summary */}
            <div className="bg-accent/40 rounded-xl p-3 mb-4">
              <div className="flex gap-1.5 mb-2 overflow-hidden">
                {products.map((p) => (
                  <img
                    key={p.id}
                    src={p.image}
                    alt={p.title}
                    className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                  />
                ))}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {products.length} პროდუქტი ·{" "}
                  <span className="line-through">{Math.round(anchorSum)}₾</span>
                </p>
                <p className="text-lg font-extrabold text-primary">{flatTotal}₾</p>
              </div>
              <p className="text-[11px] font-semibold text-success mt-1">მიტანა ყველგან</p>
            </div>

            <div className="mb-4">
              <Label className="text-sm font-bold text-foreground">ტელეფონი</Label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex items-center gap-1.5 h-12 px-3 bg-muted rounded-lg border border-border text-sm font-semibold text-foreground select-none flex-shrink-0">
                  <span className="text-base">🇬🇪</span>
                  <span>+995</span>
                </div>
                <div className="relative flex-1">
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="5XX XXX XXX"
                    value={cleanedPhone}
                    onChange={(e) => {
                      setPhone(cleanPhoneInput(e.target.value));
                      if (error) setError("");
                    }}
                    onBlur={() => setTouched(true)}
                    className={`h-12 text-base rounded-lg w-full pr-10 ${
                      showInlineError ? "border-destructive focus-visible:ring-destructive" : ""
                    } ${isValid ? "border-success focus-visible:ring-success" : ""}`}
                    autoFocus
                  />
                  {isValid && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-success" />
                  )}
                </div>
              </div>
              {showInlineError && (
                <p className="text-xs text-destructive mt-1.5 font-semibold">
                  შეიყვანე სწორი ნომერი (9 ციფრი, იწყება 5-ით)
                </p>
              )}
              {error && <p className="text-xs text-destructive mt-1.5 font-semibold">{error}</p>}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 text-base font-extrabold rounded-xl bg-success text-success-foreground hover:bg-success/90"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                `შეუკვეთე — ${flatTotal}₾ · მიტანა ყველგან`
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              გადაიხდი კურიერთან. თანხა წინასწარ არ იხდი.
            </p>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default BundlePhoneSheet;
