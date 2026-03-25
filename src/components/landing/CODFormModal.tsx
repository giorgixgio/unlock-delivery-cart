import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Phone, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Product } from "@/lib/constants";
import { createOrder } from "@/lib/orderService";
import { trackEvent } from "@/lib/analytics";
import { loadCustomerInfo, saveCustomerInfo } from "@/lib/customerStore";

const phoneSchema = z.object({
  phone: z.string().trim().min(5, "ტელეფონი აუცილებელია").max(20),
});

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
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const unitPrice = product.price;
  const totalBefore = unitPrice * quantity;
  const totalAfter = totalBefore * (1 - discountPct / 100);

  // Load saved phone
  useEffect(() => {
    if (!open) {
      setSuccess(false);
      return;
    }
    const saved = loadCustomerInfo();
    if (saved?.phone) setPhone(saved.phone);
  }, [open]);

  const handleSubmit = async () => {
    const result = phoneSchema.safeParse({ phone });
    if (!result.success) {
      setError(result.error.errors[0]?.message || "ტელეფონი აუცილებელია");
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      saveCustomerInfo({ phone, region: "", address: "" });

      // Create order with status pending_details (phone only, no address)
      const order = await createOrder({
        customerName: phone,
        customerPhone: phone,
        items: [{ product, quantity }],
        subtotal: totalAfter,
        total: totalAfter + 5, // default delivery fee
        shippingFee: 5,
        source: "landing_cod",
        landingSlug,
        status: "pending_details",
      });

      trackEvent("phone_submitted", {
        order_id: order.id,
        order_number: order.public_order_number,
        phone: phone.slice(-4),
        product_id: product.id,
        total: totalAfter,
        landing_slug: landingSlug,
      });

      // Show brief success flash
      setSuccess(true);
      setTimeout(() => {
        onPhoneOrderCreated(order.id, order.public_order_number, totalAfter);
      }, 600);
    } catch (err: any) {
      console.error("Phone order failed:", err);
      if (err?.message?.startsWith("OUT_OF_STOCK")) {
        setError("პროდუქტი ამჟამად არ არის ხელმისაწვდომი.");
      } else {
        setError("შეკვეთა ვერ შეიქმნა. სცადეთ თავიდან.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[80vh] rounded-t-2xl overflow-y-auto pb-8">
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
