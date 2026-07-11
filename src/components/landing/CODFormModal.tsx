import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, CheckCircle2, Check } from "lucide-react";
import { Product } from "@/lib/constants";
import { submitCustomerOrder } from "@/lib/orderService";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";
import { trackPhoneFormViewed, trackPhoneSubmitted } from "@/lib/funnelTracking";
import { trackStockoutAttempt } from "@/lib/metaPixel";
import StockoutMessageView from "./StockoutMessageView";

const cleanPhoneInput = (raw: string): string => {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("995")) d = d.slice(3);
  while (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 9);
};

const JUNK_PATTERNS = new Set([
  "555555555", "500000000", "512345678", "555123456",
  "123456789", "111111111", "000000000",
]);

const isValidGeorgianMobile = (digits: string): boolean => {
  if (digits.length !== 9) return false;
  if (digits[0] !== "5") return false;
  if (/^(\d)\1{8}$/.test(digits)) return false;
  if (JUNK_PATTERNS.has(digits)) return false;
  return true;
};

interface CODFormModalProps {
  open: boolean;
  onClose: () => void;
  product: Product;
  quantity: number;
  discountPct: number;
  landingSlug: string;
  landingVariant: string;
  onPhoneOrderCreated: (orderId: string, orderNumber: string, orderTotal: number) => void;
}

const CODFormModal = ({
  open,
  onClose,
  product,
  quantity,
  discountPct,
  landingSlug,
  onPhoneOrderCreated,
}: CODFormModalProps) => {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [stockoutAttemptId, setStockoutAttemptId] = useState<string | null>(null);
  const [showStockout, setShowStockout] = useState(false);
  const navigate = useNavigate();

  const cleanedPhone = cleanPhoneInput(phone);
  const isValid = isValidGeorgianMobile(cleanedPhone);
  const showInlineError = touched && !isValid && cleanedPhone.length > 0;

  const unitPrice = product.price;
  const totalBefore = unitPrice * quantity;
  const totalAfter = totalBefore * (1 - discountPct / 100);

  // Load saved phone + track form view
  useEffect(() => {
    if (!open) {
      setSuccess(false);
      setShowStockout(false);
      setStockoutAttemptId(null);
      setTouched(false);
      return;
    }
    const saved = loadCustomerInfo();
    if (saved?.phone) setPhone(cleanPhoneInput(saved.phone));
    trackPhoneFormViewed(product.id);
  }, [open]);

  const handleStockoutBranch = async (attemptId?: string | null) => {
    if (attemptId) {
      console.log("[stockout] inserted row id", attemptId);
      setStockoutAttemptId(attemptId);
    }
    // Fire OutOfStockAttempt custom event ONLY — never Purchase/Lead.
    trackStockoutAttempt({
      productId: product.id,
      productName: product.title,
      sku: (product as any).sku ?? null,
      value: totalAfter,
    });
    setShowStockout(true);
  };

  const handleSubmit = async () => {
    setTouched(true);
    if (!isValid) {
      setError("");
      return;
    }
    const submitPhone = cleanedPhone;

    setSubmitting(true);
    setError("");
    try {
      console.log("Landing page order submit started", {
        route: window.location.pathname,
        productHandle: product.handle,
        productId: product.id,
        sku: product.sku,
        quantity,
      });
      console.log("Resolved product:", {
        product_id: product.id,
        handle: product.handle,
        sku: product.sku,
        stock: product.available,
      });

      saveCustomerInfo({ phone, region: "", address: "" });

      // Create order with status pending_details (phone only, no address)
      const result = await submitCustomerOrder({
        debugLabel: "Landing page order submit",
        order: {
          customerName: phone,
          customerPhone: phone,
          items: [{ product, quantity }],
          subtotal: totalAfter,
          total: totalAfter + 5,
          shippingFee: 5,
          source: "landing_cod",
          landingSlug,
          status: "pending_details",
        },
        stockout: {
          productId: product.id,
          productHandle: product.handle ?? null,
          sku: (product as any).sku ?? null,
          productName: product.title,
          phone,
          quantity,
          source: "landing_cod",
          landingPageUrl: window.location.href,
        },
      });

      if (result.kind === "stockout") {
        await handleStockoutBranch(result.attemptId);
        return;
      }

      const { order } = result;

      // ═══ MAIN CONVERSION: Fire Meta Purchase + PostHog phone_submitted ═══
      trackPhoneSubmitted({
        orderId: order.id,
        orderNumber: order.public_order_number,
        productId: product.id,
        productName: product.title,
        baseValue: totalAfter, // base product value only, no shipping
        landingSlug,
      });

      // Show brief success flash
      setSuccess(true);
      setTimeout(() => {
        onPhoneOrderCreated(order.id, order.public_order_number, totalAfter);
      }, 600);
    } catch (err: any) {
      console.error("Phone order failed:", err);
      setError("შეკვეთა ვერ შეიქმნა. სცადეთ თავიდან.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl overflow-y-auto pb-8">
        {showStockout ? (
          <>
            <SheetTitle className="sr-only">მარაგი ამოწურულია</SheetTitle>
            <StockoutMessageView
              attemptId={stockoutAttemptId}
              onClose={() => {
                onClose();
                navigate("/");
              }}
            />
          </>
        ) : success ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <CheckCircle2 className="w-14 h-14 text-success animate-bounce" />
            <p className="text-lg font-extrabold text-foreground">✔️ შეკვეთა დაფიქსირდა</p>
          </div>
        ) : (
          <>
            <SheetTitle className="text-xl font-extrabold text-foreground mb-1">
              შეუკვეთე 1 წუთში
            </SheetTitle>
            <p className="text-sm text-muted-foreground mb-5">მხოლოდ ტელეფონის ნომერი</p>

            {/* Order summary */}
            <div className="bg-accent/40 rounded-xl p-3 mb-5 flex items-center gap-3">
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

            {/* Phone field */}
            <div className="mb-4">
              <Label className="text-sm font-bold text-foreground">ტელეფონი</Label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex items-center gap-1.5 h-12 px-3 bg-muted rounded-lg border border-border text-sm font-semibold text-foreground select-none flex-shrink-0">
                  <span className="text-base">🇬🇪</span>
                  <span>+995</span>
                </div>
                <Input
                  type="tel"
                  placeholder="5XX XXX XXX"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (error) setError("");
                  }}
                  className="h-12 text-base rounded-lg flex-1"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-destructive mt-1">{error}</p>}
            </div>

            {/* COD badge */}
            <div className="flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 mb-4">
              <Phone className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-foreground">გადახდა მიტანისას — კურიერთან</span>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  იგზავნება...
                </>
              ) : (
                "შეუკვეთე"
              )}
            </Button>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default CODFormModal;
