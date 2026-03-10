import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { ArrowLeft, Truck, UserCheck, Pencil, ChevronDown, ChevronUp, Minus, Plus, Trash2, ShoppingBag, Lock, RotateCcw, Phone, MapPin, Wrench, Clock, Check, AlertCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { useDelivery } from "@/contexts/DeliveryContext";
import DeliveryInfoBox from "@/components/DeliveryInfoBox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { createOrder } from "@/lib/orderService";
import { loadCustomerInfo, saveCustomerInfo, clearCustomerInfo } from "@/lib/customerStore";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions } from "@/lib/addressPredictor";
import { supabase } from "@/integrations/supabase/client";

const orderSchema = z.object({
  name: z.string().trim().min(1, "სახელი აუცილებელია").max(100),
  phone: z.string().trim().min(5, "ტელეფონი აუცილებელია").max(20),
  region: z.string().trim().min(1, "რეგიონი/ქალაქი აუცილებელია").max(100),
  address: z.string().trim().min(1, "მისამართი აუცილებელია").max(300),
});

// Georgian flag inline SVG component
const GeorgianFlag = () => (
  <svg width="22" height="15" viewBox="0 0 22 15" fill="none" style={{ borderRadius: 2, flexShrink: 0 }}>
    <rect width="22" height="15" fill="white" />
    <rect x="9.5" y="0" width="3" height="15" fill="#FF0000" />
    <rect x="0" y="6" width="22" height="3" fill="#FF0000" />
    {/* Bolnisi crosses in 4 quadrants */}
    <g fill="#FF0000">
      {/* Top-left */}
      <rect x="4" y="2" width="1.5" height="3" />
      <rect x="3.25" y="2.75" width="3" height="1.5" />
      {/* Top-right */}
      <rect x="16" y="2" width="1.5" height="3" />
      <rect x="15.25" y="2.75" width="3" height="1.5" />
      {/* Bottom-left */}
      <rect x="4" y="10" width="1.5" height="3" />
      <rect x="3.25" y="10.75" width="3" height="1.5" />
      {/* Bottom-right */}
      <rect x="16" y="10" width="1.5" height="3" />
      <rect x="15.25" y="10.75" width="3" height="1.5" />
    </g>
  </svg>
);

// Check if phone is a valid Georgian number
const isValidGeorgianPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, "");
  // 5XXXXXXXX (9 digits) or 9955XXXXXXXX (12 digits)
  return /^5\d{8}$/.test(digits) || /^9955\d{8}$/.test(digits);
};

// Countdown timer hook — purely decorative
const useCountdown = (startMinutes: number) => {
  const [seconds, setSeconds] = useState(startMinutes * 60);
  useEffect(() => {
    const id = setInterval(() => {
      setSeconds((s) => (s <= 1 ? startMinutes * 60 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [startMinutes]);
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

interface CartOverlayProps {
  isOpen: boolean;
}

const Cart = ({ isOpen }: CartOverlayProps) => {
  const { items, total, remaining, updateQuantity, removeItem, clearCart, shippingFee, orderTotal, itemCount } = useCart();
  const { closeCart, dismissCart } = useCartOverlay();
  const { handleCheckoutIntent } = useCheckoutGate();
  const { setManualLocation, isTbilisi } = useDelivery();
  const { isLandingPage, landingSlug } = useLandingPage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const nameRef = useRef<HTMLInputElement>(null);
  const cityRef = useRef<HTMLDivElement>(null);

  const canCheckout = isLandingPage ? items.length > 0 : remaining <= 0;

  const [form, setForm] = useState({ name: "", phone: "", region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [isRecognized, setIsRecognized] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Collapsible cart summary
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // CHANGE 1: Phone-first progressive disclosure
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  // CHANGE 8: Confirmation checkbox
  const [confirmChecked, setConfirmChecked] = useState(false);

  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);

  const countdown = useCountdown(6);

  // Phone validity check for reveal
  useEffect(() => {
    if (isValidGeorgianPhone(form.phone) && !phoneRevealed) {
      setPhoneRevealed(true);
      // Auto-focus city after animation
      setTimeout(() => {
        cityRef.current?.querySelector("input")?.focus();
      }, 280);
    }
  }, [form.phone, phoneRevealed]);

  // If recognized user, fields should be revealed
  useEffect(() => {
    if (isRecognized) setPhoneRevealed(true);
  }, [isRecognized]);

  // Fetch historical cities/addresses
  useEffect(() => {
    if (!isOpen) return;
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
          setHistoricalCities([...new Set(cities.map(c => c.normalized_city).filter(Boolean) as string[])]);
        }
        if (addresses) {
          setHistoricalAddresses([...new Set(addresses.map(a => a.normalized_address).filter(Boolean) as string[])]);
        }
      } catch {}
    };
    fetchHistorical();
  }, [isOpen]);

  // Load saved customer
  useEffect(() => {
    if (!isOpen) return;
    const saved = loadCustomerInfo();
    if (saved && (saved.name || saved.phone)) {
      setForm({
        name: saved.name || "",
        phone: saved.phone || "",
        region: saved.region || "",
        address: saved.address || "",
      });
      setIsRecognized(true);
      if (saved.region) {
        const lower = saved.region.trim().toLowerCase();
        setManualLocation(lower === "თბილისი" || lower === "tbilisi");
      }
    }
  }, [isOpen, setManualLocation]);

  // Autofocus phone field (changed from name)
  useEffect(() => {
    if (isOpen && !isRecognized) {
      setTimeout(() => {
        document.getElementById("checkout-phone-input")?.focus();
      }, 350);
    }
  }, [isOpen, isRecognized]);

  const formRef2 = useRef(form);
  formRef2.current = form;

  const persistForm = useCallback((data: typeof form) => {
    saveCustomerInfo(data);
  }, []);

  useEffect(() => {
    return () => {
      const current = formRef2.current;
      if (current.name || current.phone || current.region || current.address) {
        saveCustomerInfo(current);
      }
    };
  }, []);

  const handleChange = (field: string, value: string) => {
    const next = { ...form, [field]: value };
    setForm(next);
    setTouched((prev) => ({ ...prev, [field]: true }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: "" }));
    if (field === "region") {
      const lower = value.trim().toLowerCase();
      setManualLocation(lower === "თბილისი" || lower === "tbilisi");
    }
    persistForm(next);
  };

  const handleStartEditing = () => {
    setIsEditing(true);
    setTouched({ name: true, phone: true, region: true, address: true });
  };

  // Form validity for CTA disable state
  const isFormValid = useMemo(() => {
    const result = orderSchema.safeParse(form);
    return result.success;
  }, [form]);

  const handleSubmit = async () => {
    const hasAnyTouched = Object.values(touched).some(Boolean);
    if (!hasAnyTouched && !isRecognized) return;

    const result = orderSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      ["name", "phone", "region", "address"].forEach((f) => setTouched((prev) => ({ ...prev, [f]: true })));
      setErrors(fieldErrors);
      if (isRecognized && !isEditing) setIsEditing(true);
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
        shippingFee,
        total: orderTotal,
        ...(isLandingPage ? { source: "landing_pdp", landingSlug } : {}),
      });
      clearCustomerInfo();
      clearCart();
      dismissCart();
      navigate("/success", { state: { orderNumber: order.public_order_number, orderTotal }, replace: true });
    } catch (err) {
      console.error("Order creation failed:", err);
      toast({ title: "შეკვეთის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.", variant: "destructive", duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  if (items.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
        <div className="min-h-screen flex flex-col items-center justify-center px-4">
          <p className="text-xl font-bold text-foreground mb-4">კალათა ცარიელია</p>
          <Button onClick={closeCart} variant="outline" size="lg">
            <ArrowLeft className="w-5 h-5 mr-2" />
            უკან დაბრუნება
          </Button>
        </div>
      </div>
    );
  }

  const showRecognizedCard = isRecognized && !isEditing;

  // CHANGE 7: CTA color logic
  const allFieldsValid = isFormValid && confirmChecked;
  const ctaColorClass = !canCheckout
    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
    : allFieldsValid
    ? "cta-green-gradient text-white"
    : "cta-orange-gradient text-white";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
      <div className="pb-24">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
          <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button onClick={closeCart} className="p-1">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <h1 className="text-lg font-extrabold tracking-tight">შეკვეთის გაფორმება</h1>
          </div>
        </header>

        <div className="container max-w-2xl mx-auto px-4 pt-3 space-y-2.5">

          {/* ══════ SECTION 1: Collapsible Order Summary Bar ══════ */}
          <div className="checkout-card overflow-hidden">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 active:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <ShoppingBag className="w-4 h-4 text-primary" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-foreground">
                    {itemCount} პროდუქტი — {orderTotal.toFixed(1)}₾
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    სულ {orderTotal.toFixed(1)}₾ · მიტანა უფასო
                  </p>
                </div>
              </div>
              {summaryExpanded ? (
                <ChevronUp className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronDown className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              )}
            </button>

            {/* Expandable cart items */}
            <div
              className="transition-[max-height] duration-300 ease-in-out overflow-hidden"
              style={{ maxHeight: summaryExpanded ? `${items.length * 88 + 16}px` : "0px" }}
            >
              <div className="px-4 pb-3 space-y-2 border-t border-border/50">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex items-center gap-3 py-2">
                    <img
                      src={product.image}
                      alt={product.title}
                      className="w-14 h-14 rounded-md object-cover flex-shrink-0 border border-border"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground line-clamp-1">{product.title}</p>
                      <p className="text-sm font-bold text-primary">{(product.price * quantity).toFixed(1)} ₾</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        onClick={() => updateQuantity(product.id, quantity - 1)}
                        variant="outline" size="icon"
                        className="h-7 w-7 rounded-md"
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <span className="text-sm font-bold w-5 text-center">{quantity}</span>
                      <Button
                        onClick={() => updateQuantity(product.id, quantity + 1)}
                        size="icon"
                        className="h-7 w-7 rounded-md"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      <Button
                        onClick={() => removeItem(product.id)}
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary row: subtotal + shipping */}
            <div className="px-4 py-2.5 bg-muted/30 border-t border-border/50 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">მიტანა</span>
              <span className="text-xs font-bold text-success flex items-center gap-1">
                <Check className="w-3 h-3" /> უფასო ✓
              </span>
            </div>
          </div>

          {/* ══════ CHANGE 5: Trust Icon Row ══════ */}
          <div className="checkout-card px-4 py-2.5">
            <div className="flex items-center justify-between">
              {[
                { icon: <Lock className="w-4 h-4 text-muted-foreground" />, label: "უსაფრთხო" },
                { icon: <RotateCcw className="w-4 h-4 text-muted-foreground" />, label: "დაბრუნება" },
                { icon: <Truck className="w-4 h-4 text-muted-foreground" />, label: "სწრაფი" },
                { icon: <Phone className="w-4 h-4 text-muted-foreground" />, label: "მხარდაჭერა" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-1">
                  {item.icon}
                  <span className="text-[10px] font-semibold text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══════ SECTION 2: Order Form ══════ */}
          <div className="checkout-card overflow-hidden">
            {showRecognizedCard ? (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-success" />
                    </div>
                    <h2 className="text-base font-bold text-foreground">შენი მონაცემები</h2>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={handleStartEditing}
                    className="text-sm text-primary font-semibold h-8 px-3 gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    შეცვლა
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  {[
                    { label: "სახელი", value: form.name },
                    { label: "ტელეფონი", value: form.phone },
                    { label: "ქალაქი", value: form.region },
                    { label: "მისამართი", value: form.address },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{row.label}</span>
                      <span className="text-sm font-semibold text-foreground text-right max-w-[60%]">{row.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-foreground">შეკვეთის მონაცემები</h2>
                  {isRecognized && isEditing && (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}
                      className="text-sm text-muted-foreground font-medium h-8 px-3">
                      გაუქმება
                    </Button>
                  )}
                </div>
                <div className="space-y-2.5">
                  {/* CHANGE 1: Name field hidden (display:none, stays in DOM) */}
                  <div style={{ display: "none" }}>
                    <Label className="text-sm font-bold text-foreground">სახელი</Label>
                    <Input
                      ref={nameRef}
                      type="text"
                      autoComplete="name"
                      placeholder="თქვენი სახელი"
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      className="mt-1 h-12 text-base rounded-xl"
                    />
                    {errors.name && <p className="text-sm text-destructive mt-1">{errors.name}</p>}
                  </div>

                  {/* CHANGE 2: Phone input with flag prefix */}
                  <div>
                    <Label className="text-sm font-bold text-foreground">ტელეფონი</Label>
                    <div className="mt-1 phone-prefix-group flex">
                      <div className="phone-prefix-panel flex items-center gap-[5px] px-2.5 bg-[#f3f4f6] border-[1.5px] border-[#e5e7eb] border-r-0 rounded-l-xl">
                        <GeorgianFlag />
                        <span className="text-[13px] font-bold text-foreground/80">+995</span>
                        <div className="w-px h-5 bg-[#e5e7eb] ml-1" />
                      </div>
                      <Input
                        id="checkout-phone-input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="5XX XXX XXX"
                        value={form.phone}
                        onChange={(e) => handleChange("phone", e.target.value)}
                        className="h-12 text-base rounded-l-none rounded-r-xl border-[1.5px] border-[#e5e7eb] checkout-input flex-1"
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.phone}
                      </p>
                    )}
                  </div>

                  {/* CHANGE 4: Microcopy below phone */}
                  <div className="flex items-center gap-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[9px] px-[11px] py-2">
                    <Phone className="w-3.5 h-3.5 text-[#166534] flex-shrink-0" />
                    <span className="text-[11px] font-medium text-[#166534]">კურიერი დაგიკავშირდებათ შეკვეთის დასადასტურებლად</span>
                  </div>

                  {/* CHANGE 1: City and address — progressive reveal */}
                  <div
                    className="transition-all duration-[280ms] ease-out overflow-hidden"
                    style={{
                      maxHeight: phoneRevealed ? "400px" : "0px",
                      opacity: phoneRevealed ? 1 : 0,
                      transform: phoneRevealed ? "translateY(0)" : "translateY(8px)",
                    }}
                  >
                    <div className="space-y-2.5" ref={cityRef}>
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
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══════ SECTION 3: COD trust block ══════ */}
          <div className="checkout-card px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <Truck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                <span>გადახდა მიტანისას</span>
              </p>
              <p className="text-[11px] text-muted-foreground">ბარათით ან ნაღდით — კურიერს</p>
            </div>
          </div>

          {/* ══════ SECTION 4: Delivery info ══════ */}
          <div className="opacity-80">
            <DeliveryInfoBox />
          </div>

          {/* ══════ CHANGE 8: Confirmation checkbox ══════ */}
          {phoneRevealed && canCheckout && (
            <div
              className="flex items-start gap-3 px-1 transition-all duration-[250ms] ease-out"
              style={{ animation: "fade-up 250ms ease-out" }}
            >
              <button
                type="button"
                onClick={() => setConfirmChecked(!confirmChecked)}
                className={`w-[19px] h-[19px] rounded-[5px] border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 ${
                  confirmChecked
                    ? "bg-primary border-primary"
                    : "border-[#d1d5db] bg-white"
                }`}
              >
                {confirmChecked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
              </button>
              <span className="text-[11px] text-muted-foreground leading-relaxed">
                ვადასტურებ, რომ მიტანისას გადავიხდი {orderTotal.toFixed(1)}₾ კურიერთან.
              </span>
            </div>
          )}

          {/* ══════ CHANGE 10: Social proof line ══════ */}
          <div className="flex items-center justify-center gap-1.5 py-1">
            <span className="w-2 h-2 rounded-full bg-[#22c55e] social-proof-pulse" />
            <span className="text-[11px] text-muted-foreground">7 ადამიანი ახლა ამ გვერდზეა</span>
          </div>
        </div>
      </div>

      {/* ══════ STICKY CTA ══════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-3 shadow-lg">
        <div className="container max-w-2xl mx-auto relative">
          {/* CHANGE 6: Timer badge */}
          <div className="absolute -top-[11px] right-[14px] bg-[#dc2626] text-white rounded-[20px] px-[9px] py-[3px] flex items-center gap-1 z-10 cta-timer-pulse">
            <Clock className="w-[11px] h-[11px]" />
            <span className="text-[11px] font-extrabold tabular-nums tracking-[0.5px]">{countdown}</span>
          </div>
          <Button
            onClick={canCheckout ? handleSubmit : () => { closeCart(); handleCheckoutIntent("cart_page"); }}
            disabled={submitting || (canCheckout && !isFormValid && !showRecognizedCard)}
            className={`w-full h-14 text-lg font-bold rounded-xl transition-all duration-300 ${ctaColorClass}`}
            size="lg"
          >
            {submitting
              ? "იგზავნება..."
              : canCheckout
              ? "შეკვეთა — გადახდა მიწოდებისას"
              : `🔓 დაამატე ${remaining.toFixed(1)} ₾ — გახსენი შეკვეთა`}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
