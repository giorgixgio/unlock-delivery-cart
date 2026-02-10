import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trash2, Truck, UserCheck, Pencil } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useDelivery } from "@/contexts/DeliveryContext";
import DeliveryProgressBar from "@/components/DeliveryProgressBar";
import DeliveryInfoBox from "@/components/DeliveryInfoBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { createOrder } from "@/lib/orderService";
import { loadCustomerInfo, saveCustomerInfo, clearCustomerInfo } from "@/lib/customerStore";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions, type Suggestion } from "@/lib/addressPredictor";
import { supabase } from "@/integrations/supabase/client";

const orderSchema = z.object({
  name: z.string().trim().min(1, "სახელი აუცილებელია").max(100),
  phone: z.string().trim().min(5, "ტელეფონი აუცილებელია").max(20),
  region: z.string().trim().min(1, "რეგიონი/ქალაქი აუცილებელია").max(100),
  address: z.string().trim().min(1, "მისამართი აუცილებელია").max(300),
});

const Cart = () => {
  const { items, total, isUnlocked, updateQuantity, removeItem, clearCart } = useCart();
  const { setManualLocation, isTbilisi } = useDelivery();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Gate: redirect home if not unlocked
  useEffect(() => {
    if (!isUnlocked) {
      toast({ title: "მინიმალური შეკვეთა 40 ₾ — დაამატე პროდუქტები", duration: 3000 });
      navigate("/", { replace: true });
    }
  }, [isUnlocked, navigate, toast]);

  const [form, setForm] = useState({ name: "", phone: "", region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const buttonAnchorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [isButtonInView, setIsButtonInView] = useState(false);

  // Remembered customer state
  const [isRecognized, setIsRecognized] = useState(false);

  // Historical data for predictions
  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  // Fetch historical cities/addresses for prediction
  useEffect(() => {
    const fetchHistorical = async () => {
      try {
        const { data: cities } = await supabase
          .from("orders")
          .select("normalized_city")
          .not("normalized_city", "is", null)
          .neq("normalized_city", "")
          .neq("status", "merged")
          .order("created_at", { ascending: false })
          .limit(200);
        
        const { data: addresses } = await supabase
          .from("orders")
          .select("normalized_address")
          .not("normalized_address", "is", null)
          .neq("normalized_address", "")
          .neq("status", "merged")
          .order("created_at", { ascending: false })
          .limit(200);
        
        if (cities) {
          const unique = [...new Set(cities.map(c => c.normalized_city).filter(Boolean) as string[])];
          setHistoricalCities(unique);
        }
        if (addresses) {
          const unique = [...new Set(addresses.map(a => a.normalized_address).filter(Boolean) as string[])];
          setHistoricalAddresses(unique);
        }
      } catch {
        // Silently fail — predictions still work from dataset
      }
    };
    fetchHistorical();
  }, []);

  // Load saved customer on mount
  useEffect(() => {
    const saved = loadCustomerInfo();
    if (saved && (saved.name || saved.phone)) {
      setForm({
        name: saved.name || "",
        phone: saved.phone || "",
        region: saved.region || "",
        address: saved.address || "",
      });
      setIsRecognized(true);
      // Set delivery location from saved region
      if (saved.region) {
        const lower = saved.region.trim().toLowerCase();
        setManualLocation(lower === "თბილისი" || lower === "tbilisi");
      }
    }
  }, [setManualLocation]);

  useEffect(() => {
    const el = buttonAnchorRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsButtonInView(entry.isIntersecting),
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [items.length]);

  // Auto-save customer info on field changes (debounced)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const persistForm = useCallback((data: typeof form) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveCustomerInfo(data);
    }, 800);
  }, []);

  const handleChange = (field: string, value: string) => {
    const next = { ...form, [field]: value };
    setForm(next);
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
    // Update delivery location based on region/city field
    if (field === "region") {
      const lower = value.trim().toLowerCase();
      setManualLocation(lower === "თბილისი" || lower === "tbilisi");
    }
    // Save customer info
    persistForm(next);
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    // Mark all fields as touched so validation shows on submit
    setTouched({ name: true, phone: true, region: true, address: true });
  };

  const handleSubmit = async () => {
    // If form hasn't been interacted with and user isn't recognized, just scroll to it
    const hasAnyTouched = Object.values(touched).some(Boolean);
    if (!hasAnyTouched && !isRecognized) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const result = orderSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) {
          fieldErrors[e.path[0] as string] = e.message;
        }
      });
      // Mark all as touched
      const allFields = ["name", "phone", "region", "address"];
      allFields.forEach((f) => setTouched((prev) => ({ ...prev, [f]: true })));
      setErrors(fieldErrors);
      // If recognized but in preview mode, switch to edit mode
      if (isRecognized && !isEditing) {
        setIsEditing(true);
      }
      return;
    }

    setSubmitting(true);
    try {
      const order = await createOrder({
        customerName: form.name,
        customerPhone: form.phone,
        city: form.region,
        region: form.region,
        addressLine1: form.address,
        isTbilisi,
        items,
        subtotal: total,
        total,
      });
      // Clear saved customer info after successful order
      clearCustomerInfo();
      clearCart();
      navigate("/success", { state: { orderNumber: order.public_order_number } });
    } catch (err) {
      console.error("Order creation failed:", err);
      toast({ title: "შეკვეთის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.", variant: "destructive", duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <p className="text-xl font-bold text-foreground mb-4">კალათა ცარიელია</p>
        <Button onClick={() => navigate("/")} variant="outline" size="lg">
          <ArrowLeft className="w-5 h-5 mr-2" />
          მთავარზე დაბრუნება
        </Button>
      </main>
    );
  }

  // Show compact "remembered" card when recognized and not editing
  const showRecognizedCard = isRecognized && !isEditing;

  return (
    <main className="pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
        <div className="container max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <button onClick={() => navigate("/")} className="p-1">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-extrabold tracking-tight">კალათა</h1>
        </div>
      </header>

      <div className="container max-w-2xl mx-auto px-4 pt-4 space-y-4">
        {/* Progress bar */}
        <div className="bg-card rounded-lg p-4 shadow-card border border-border">
          <DeliveryProgressBar />
        </div>

        {/* Items */}
        <div className="space-y-3">
          {items.map(({ product, quantity }) => (
            <div
              key={product.id}
              className="flex items-center gap-3 bg-card rounded-lg p-3 shadow-card border border-border"
            >
              <img
                src={product.image}
                alt={product.title}
                className="w-16 h-16 rounded-md object-cover flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground line-clamp-1">{product.title}</p>
                <p className="text-lg font-bold text-primary">{(product.price * quantity).toFixed(1)} ₾</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => updateQuantity(product.id, quantity - 1)}
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="text-lg font-bold w-6 text-center">{quantity}</span>
                <Button
                  onClick={() => updateQuantity(product.id, quantity + 1)}
                  size="icon"
                  className="h-10 w-10 rounded-lg"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  onClick={() => removeItem(product.id)}
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        {/* Delivery estimate */}
        <DeliveryInfoBox />

        {/* COD info block */}
        <div className="bg-accent rounded-lg p-4 border border-primary/20 flex items-start gap-3">
          <Truck className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-foreground text-sm">გადახდა მიტანისას</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              თანხას გადაიხდით კურიერთან. ბარათი არ გჭირდებათ.
            </p>
          </div>
        </div>

        {/* Order form — recognized vs editable */}
        <div ref={formRef} className="bg-card rounded-lg shadow-card border border-border overflow-hidden">
          {showRecognizedCard ? (
            /* ───── Remembered customer compact card ───── */
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                    <UserCheck className="w-4 h-4 text-success" />
                  </div>
                  <h2 className="text-base font-bold text-foreground">შენი მონაცემები</h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartEditing}
                  className="text-sm text-primary font-semibold h-8 px-3 gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  შეცვლა
                </Button>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">სახელი</span>
                  <span className="text-sm font-semibold text-foreground">{form.name || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ტელეფონი</span>
                  <span className="text-sm font-semibold text-foreground">{form.phone || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">ქალაქი</span>
                  <span className="text-sm font-semibold text-foreground">{form.region || "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">მისამართი</span>
                  <span className="text-sm font-semibold text-foreground text-right max-w-[60%]">{form.address || "—"}</span>
                </div>
              </div>
            </div>
          ) : (
            /* ───── Editable form ───── */
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-foreground">შეკვეთის მონაცემები</h2>
                {isRecognized && isEditing && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsEditing(false)}
                    className="text-sm text-muted-foreground font-medium h-8 px-3"
                  >
                    გაუქმება
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {/* Name */}
                <div>
                  <Label className="text-sm font-bold text-foreground">სახელი</Label>
                  <Input
                    type="text"
                    placeholder="თქვენი სახელი"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    className="mt-1 h-12 text-base rounded-lg"
                  />
                  {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                </div>
                {/* Phone */}
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
                {/* City — Predictive */}
                <div>
                  <Label className="text-sm font-bold text-foreground">რეგიონი / ქალაქი</Label>
                  <div className="mt-1">
                    <PredictiveInput
                      value={form.region}
                      onChange={(val) => handleChange("region", val)}
                      onSelect={(s) => {
                        handleChange("region", s.text);
                      }}
                      getSuggestions={(input) => getCitySuggestions(input, historicalCities)}
                      placeholder="მაგ: თბილისი"
                      error={errors.region}
                    />
                  </div>
                </div>
                {/* Address — Predictive */}
                <div>
                  <Label className="text-sm font-bold text-foreground">მისამართი</Label>
                  <div className="mt-1">
                    <PredictiveInput
                      value={form.address}
                      onChange={(val) => handleChange("address", val)}
                      onSelect={(s) => {
                        handleChange("address", s.text);
                      }}
                      getSuggestions={(input) => getAddressSuggestions(input, form.region, historicalAddresses)}
                      placeholder="ქუჩა, სახლი, ბინა"
                      error={errors.address}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit — inline anchor */}
        <div ref={buttonAnchorRef}>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className={`w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground transition-all duration-200 ${isButtonInView ? "" : "invisible"}`}
            size="lg"
          >
            {submitting ? "იგზავნება..." : "შეკვეთა — გადახდა მიტანისას"}
          </Button>
        </div>
      </div>

      {/* Sticky bottom button — hides when inline one is visible */}
      {!isButtonInView && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-4 shadow-lg">
          <div className="container max-w-2xl mx-auto">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground transition-all duration-200"
              size="lg"
            >
              {submitting ? "იგზავნება..." : "შეკვეთა — გადახდა მიტანისას"}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Cart;
