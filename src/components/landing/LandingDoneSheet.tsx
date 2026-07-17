import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Package, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackDoneScreenViewed, trackDoneScreenClosed } from "@/lib/funnelTracking";

interface OrderItem {
  id: string;
  title: string;
  quantity: number;
  line_total: number;
  image_url: string | null;
}

interface OrderDetails {
  id: string;
  public_order_number: string | null;
  city: string | null;
  region: string | null;
  address_line1: string | null;
  subtotal: number | null;
  shipping_fee: number | null;
  total: number | null;
  order_items: OrderItem[];
}

interface LandingDoneSheetProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  deliveryFee: number;
  total: number;
}

const TOP_SAFE_PADDING = "calc(28px + env(safe-area-inset-top))";

const LandingDoneSheet = ({
  open,
  onClose,
  orderId,
  orderNumber,
  deliveryFee,
  total,
}: LandingDoneSheetProps) => {
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !orderId) return;
    setLoading(true);
    trackDoneScreenViewed(orderId, orderNumber);

    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("orders")
          .select(
            "id, public_order_number, city, region, address_line1, subtotal, shipping_fee, total, order_items(id, title, quantity, line_total, image_url)"
          )
          .eq("id", orderId)
          .maybeSingle();

        if (error) throw error;
        setOrder(data as OrderDetails | null);
      } catch (err) {
        console.error("Failed to load order for done screen:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, orderId, orderNumber]);

  const handleClose = () => {
    trackDoneScreenClosed(orderId, orderNumber);
    onClose();
  };

  const items = order?.order_items || [];
  const subtotal = order?.subtotal ?? total - deliveryFee;
  const shipping = order?.shipping_fee ?? deliveryFee;
  const finalTotal = order?.total ?? total;
  const city = order?.city || order?.region || "";
  const address = order?.address_line1 || "";

  return (
    <Sheet open={open} onOpenChange={() => {}}>
      <SheetContent
        side="bottom"
        className="h-[100dvh] rounded-t-2xl p-0 flex flex-col overflow-hidden [&>button]:hidden"
      >
        <SheetTitle className="sr-only">შეკვეთა დასრულებულია</SheetTitle>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div
            className="mx-auto w-full px-5"
            style={{
              maxWidth: 480,
              paddingTop: TOP_SAFE_PADDING,
              paddingBottom: "calc(140px + env(safe-area-inset-bottom))",
            }}
          >
            {/* Hero check + headline */}
            <div className="text-center pt-4 pb-5">
              <div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-11 h-11 text-emerald-500" />
              </div>
              <h2 className="text-[22px] font-black text-foreground leading-tight">
                შეკვეთა დასრულებულია ✅
              </h2>
              <p className="mt-2 text-[15px] font-bold text-emerald-600 dark:text-emerald-400">
                შეკვეთა #{orderNumber} · გადაიხდი კურიერთან მიღებისას
              </p>
              <p className="mt-2 text-[13px] text-muted-foreground leading-snug px-1">
                ოპერატორი დაგიკავშირდებათ უახლოეს დროს დასადასტურებლად.
              </p>
            </div>

            {/* Order summary card */}
            <div className="rounded-[20px] bg-card border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-muted/40">
                <div className="flex items-center gap-2 text-[13px] font-bold text-foreground">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  შეკვეთის შიგთავსი
                </div>
              </div>

              {loading ? (
                <div className="p-6 text-center text-sm text-muted-foreground animate-pulse">
                  იტვირთება...
                </div>
              ) : items.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  პროდუქტები ვერ ჩაიტვირთა
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.title}
                          className="w-14 h-14 rounded-lg object-cover bg-muted flex-shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Package className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">
                          {item.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          რაოდენობა: {item.quantity}
                        </p>
                      </div>
                      <span className="text-[13px] font-bold text-foreground flex-shrink-0">
                        {item.line_total.toFixed(0)}₾
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="px-4 py-3 border-t border-border space-y-1.5 bg-muted/20">
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">პროდუქტები</span>
                  <span className="font-semibold text-foreground">{subtotal.toFixed(0)}₾</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">მიწოდება</span>
                  <span className="font-semibold text-foreground">
                    {shipping > 0 ? `${shipping.toFixed(0)}₾` : "უფასო"}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <span className="text-[14px] font-bold text-foreground">ჯამი</span>
                  <span className="text-[18px] font-black text-emerald-600 dark:text-emerald-400">
                    {finalTotal.toFixed(0)}₾
                  </span>
                </div>
              </div>
            </div>

            {/* Address summary */}
            {city && (
              <div className="mt-4 rounded-[20px] bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 p-4">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                      მისამართი
                    </p>
                    <p className="text-[14px] font-semibold text-foreground mt-0.5 leading-snug">
                      {city}
                      {address ? `, ${address}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Anti-duplicate warning */}
            <div className="mt-4 rounded-[20px] bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-4 flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-[13px] font-semibold text-amber-800 dark:text-amber-300 leading-snug">
                არ გააკეთო ხელახლა შეკვეთა — შენი შეკვეთა უკვე მიღებულია.
              </p>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <div className="flex-shrink-0 bg-card border-t border-border px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            onClick={handleClose}
            className="w-full h-14 rounded-xl bg-success hover:bg-success/90 text-success-foreground font-bold text-lg"
          >
            დახურვა
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default LandingDoneSheet;
