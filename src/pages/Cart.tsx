import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { ArrowLeft, Truck, UserCheck, Pencil, ShoppingBag, Lock, RotateCcw, Phone, Clock, Check, AlertCircle } from "lucide-react";
import { useCart } from "@/contexts/CartContext";

import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { useDelivery } from "@/contexts/DeliveryContext";
import DeliveryInfoBox from "@/components/DeliveryInfoBox";
import CheckoutProductCarousel from "@/components/CheckoutProductCarousel";
import CheckoutPriceReveal from "@/components/CheckoutPriceReveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { createOrder } from "@/lib/orderService";
import { trackEvent } from "@/lib/analytics";
import { trackInitiateCheckout, trackPurchase } from "@/lib/metaPixel";
import { loadCustomerInfo, saveCustomerInfo, clearCustomerInfo } from "@/lib/customerStore";
import PredictiveInput from "@/components/PredictiveInput";
import { getCitySuggestions, getAddressSuggestions } from "@/lib/addressPredictor";
import { supabase } from "@/integrations/supabase/client";
import ConfirmOrderModal from "@/components/ConfirmOrderModal";

// Validation: name is NOT required from user
const orderSchema = z.object({
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
    <g fill="#FF0000">
      <rect x="4" y="2" width="1.5" height="3" />
      <rect x="3.25" y="2.75" width="3" height="1.5" />
      <rect x="16" y="2" width="1.5" height="3" />
      <rect x="15.25" y="2.75" width="3" height="1.5" />
      <rect x="4" y="10" width="1.5" height="3" />
      <rect x="3.25" y="10.75" width="3" height="1.5" />
      <rect x="16" y="10" width="1.5" height="3" />
      <rect x="15.25" y="10.75" width="3" height="1.5" />
    </g>
  </svg>
);

// Check if phone is a valid Georgian number
const isValidGeorgianPhone = (phone: string): boolean => {
  const digits = phone.replace(/\D/g, "");
  return /^5\d{8}$/.test(digits) || /^9955\d{8}$/.test(digits);
};

// Generate placeholder name for order payload
const generatePlaceholderName = (): string => {
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `Customer-${suffix}`;
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
  const cityRef = useRef<HTMLDivElement>(null);
  const cityInputRef = useRef<HTMLInputElement>(null);
  const addressInputRef = useRef<HTMLInputElement>(null);

  const canCheckout = isLandingPage ? items.length > 0 : remaining <= 0;

  const [form, setForm] = useState({ phone: "", region: "", address: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  // ── Mobile keyboard detection: compact CTA when typing ──
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        setKeyboardOpen(true);
      }
    };
    const handleFocusOut = () => {
      setTimeout(() => {
        const active = document.activeElement?.tagName;
        if (active !== "INPUT" && active !== "TEXTAREA" && active !== "SELECT") {
          setKeyboardOpen(false);
        }
      }, 120);
    };
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);
    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const [isRecognized, setIsRecognized] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Product section auto-expanded
  const summaryExpanded = true;

  // Phone-first progressive disclosure
  const [phoneRevealed, setPhoneRevealed] = useState(false);

  // Confirmation modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);

  const [historicalCities, setHistoricalCities] = useState<string[]>([]);
  const [historicalAddresses, setHistoricalAddresses] = useState<string[]>([]);

  const countdown = useCountdown(6);

  // Phone validity check for reveal + focus city
  useEffect(() => {
    if (isValidGeorgianPhone(form.phone) && !phoneRevealed) {
      setPhoneRevealed(true);
      setTimeout(() => {
        cityInputRef.current?.focus();
        cityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
    }
  }, [form.phone, phoneRevealed]);

  // Focus address after city is confirmed (called from PredictiveInput onConfirm)
  const handleCityConfirm = useCallback(() => {
    setTimeout(() => {
      addressInputRef.current?.focus();
      addressInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }, []);

  // If recognized user, fields should be revealed
  useEffect(() => {
    if (isRecognized) setPhoneRevealed(true);
  }, [isRecognized]);

  // Fetch historical cities/addresses
  useEffect(() => {
    if (!isOpen) return;
    trackEvent("checkout_viewed", {
      cart_count: itemCount,
      cart_value: orderTotal,
      item_count: items.length,
    });
    trackInitiateCheckout({
      value: orderTotal,
      items: items.map(i => ({ id: i.product.id, quantity: i.quantity, price: i.product.price })),
    });
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
    if (saved && (saved.phone || saved.name)) {
      setForm({
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

  // Autofocus phone field
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
    saveCustomerInfo({ ...data, name: "" });
  }, []);

  useEffect(() => {
    return () => {
      const current = formRef2.current;
      if (current.phone || current.region || current.address) {
        saveCustomerInfo({ ...current, name: "" });
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
    setTouched({ phone: true, region: true, address: true });
  };

  // Form validity for CTA disable state
  const isFormValid = useMemo(() => {
    const result = orderSchema.safeParse(form);
    return result.success;
  }, [form]);

  const formSectionRef = useRef<HTMLDivElement>(null);

  // Missing fields helper message
  const missingFields = useMemo(() => {
    if (!canCheckout) return [];
    const missing: string[] = [];
    if (!form.phone || form.phone.trim().length < 5) missing.push("ტელეფონი");
    if (!form.region || form.region.trim().length < 1) missing.push("ქალაქი");
    if (!form.address || form.address.trim().length < 1) missing.push("მისამართი");
    return missing;
  }, [canCheckout, form]);

  // CTA click: always tappable, validates on tap
  const handleCTAClick = useCallback(() => {
    if (!canCheckout) {
      closeCart();
      handleCheckoutIntent("cart_page");
      return;
    }

    // Mark all fields as touched to show errors
    ["phone", "region", "address"].forEach((f) => setTouched((prev) => ({ ...prev, [f]: true })));

    // If phone not revealed yet, reveal and focus
    if (!phoneRevealed) {
      setPhoneRevealed(true);
      setTimeout(() => {
        document.getElementById("checkout-phone-input")?.focus();
        formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 300);
      return;
    }

    const result = orderSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((e) => {
        if (e.path[0]) fieldErrors[e.path[0] as string] = e.message;
      });
      setErrors(fieldErrors);
      if (isRecognized && !isEditing) setIsEditing(true);

      // Scroll to and focus first invalid field
      setTimeout(() => {
        if (!form.phone || form.phone.trim().length < 5) {
          const el = document.getElementById("checkout-phone-input");
          el?.focus();
          el?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (!form.region || form.region.trim().length < 1) {
          cityInputRef.current?.focus();
          cityRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else if (!form.address || form.address.trim().length < 1) {
          addressInputRef.current?.focus();
          addressInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 150);
      return;
    }

    // Validation passed — open confirmation modal
    setConfirmModalOpen(true);
  }, [canCheckout, closeCart, handleCheckoutIntent, isRecognized, form, isEditing, phoneRevealed]);

  // Actual order submission (called from modal confirm or auto-confirm)
  const handleSubmitOrder = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const order = await createOrder({
        customerName: generatePlaceholderName(),
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
      // Fire Meta Purchase BEFORE navigation for mobile reliability
      trackPurchase({
        value: orderTotal,
        orderId: order.public_order_number,
        items: items.map(i => ({ id: i.product.id, quantity: i.quantity, price: i.product.price })),
      });

      // Track with flush=true so PostHog sends immediately before navigation/unmount
      trackEvent("order_submitted", {
        order_number: order.public_order_number,
        order_total: orderTotal,
        cart_count: itemCount,
        item_count: items.length,
        cart_value: total,
        shipping_fee: shippingFee,
        is_tbilisi: isTbilisi,
        source: isLandingPage ? "landing_pdp" : "shop",
        products: items.map(i => ({
          id: i.product.id,
          name: i.product.title,
          price: i.product.price,
          quantity: i.quantity,
        })),
      }, true);
      
      clearCustomerInfo();
      clearCart();
      dismissCart();
      setConfirmModalOpen(false);
      navigate("/success", { state: { orderNumber: order.public_order_number, orderTotal, orderItems: items.map(i => ({ id: i.product.id, quantity: i.quantity, price: i.product.price })) }, replace: true });
    } catch (err) {
      console.error("Order creation failed:", err);
      setConfirmModalOpen(false);
      toast({ title: "შეკვეთის შექმნა ვერ მოხერხდა. სცადეთ თავიდან.", variant: "destructive", duration: 4000 });
    } finally {
      setSubmitting(false);
    }
  }, [submitting, form, isTbilisi, items, total, shippingFee, orderTotal, isLandingPage, landingSlug, clearCart, dismissCart, navigate, toast, itemCount]);

  // ── Urgency ticker state (before early returns for hooks rules) ──
  const URGENCY_MSGS = useMemo(() => [
    { icon: "dot",  badge: "👁 7",     text: "7 ადამიანი ახლა ამ გვერდზეა" },
    { icon: "⚡",   badge: "📦 3",     text: "ბოლო 3 შეკვეთა — სტოქი მცირდება" },
    { icon: "dot",  badge: "🚚 ხვალ",  text: "მიტანა ხვალ — თუ ახლა შეუკვეთავ" },
    { icon: "🔒",   badge: "⏱ 6წთ",   text: "კალათა 6 წუთით დარეზერვებულია" },
  ], []);

  const HOLD_MS  = 2600;
  const TRANS_MS = 380;
  const [tickerIdx,   setTickerIdx]   = useState(0);
  const [tickerPhase, setTickerPhase] = useState<"hold"|"out"|"in">("hold");

  useEffect(() => {
    let h: number, o: number, ni: number, nk: number;
    const cycle = () => {
      setTickerPhase("hold");
      h = window.setTimeout(() => {
        setTickerPhase("out");
        o = window.setTimeout(() => {
          setTickerIdx(i => (i + 1) % URGENCY_MSGS.length);
          setTickerPhase("in");
          ni = window.setTimeout(() => {
            setTickerPhase("hold");
            nk = window.setTimeout(cycle, HOLD_MS);
          }, TRANS_MS);
        }, TRANS_MS);
      }, HOLD_MS);
    };
    const kick = window.setTimeout(cycle, HOLD_MS);
    return () => [kick, h, o, ni, nk].forEach(clearTimeout);
  }, [URGENCY_MSGS]);

  const tickerMsg = URGENCY_MSGS[tickerIdx];
  const tickerVisible = tickerPhase === "hold";

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

  // CTA color logic
  const ctaColorClass = !canCheckout
    ? "bg-primary hover:bg-primary/90 text-primary-foreground"
    : isFormValid
    ? "cta-green-gradient text-white"
    : "cta-orange-gradient text-white";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
       <div className={keyboardOpen ? "pb-[100px]" : "pb-[180px]"}>
        {/* Header — compact */}
        <header className="sticky top-0 z-40 bg-primary text-primary-foreground shadow-md">
          <div className="container max-w-2xl mx-auto px-3 py-1.5 flex items-center gap-2">
            <button onClick={closeCart} className="p-0.5">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-[15px] font-extrabold tracking-tight">შეკვეთის გაფორმება</h1>
          </div>
        </header>

        <div className="container max-w-2xl mx-auto px-3 pt-2 space-y-1.5">

          {/* ══════ SECTION 1: Product Carousel (auto-expanded) ══════ */}
          <div className="checkout-card overflow-hidden">
            <div className="px-3 py-1.5 flex items-center gap-1.5">
              <span className="text-xs">🧺</span>
              <p className="text-[11px] font-bold text-foreground">
                შენი შეკვეთა ({itemCount} პროდუქტი)
              </p>
              <span className="text-[9px] font-semibold text-primary ml-auto">🔥 პაკეტი მზადაა</span>
            </div>
            <div className="px-1.5 pb-1.5">
              <CheckoutProductCarousel
                items={items}
                onUpdateQuantity={updateQuantity}
                onRemove={removeItem}
              />
            </div>
          </div>

          {/* ══════ Price Reveal + Savings ══════ */}
          <CheckoutPriceReveal />

          {/* ══════ Trust Icon Row — slim strip ══════ */}
          <div className="checkout-card px-3 py-1.5">
            <div className="flex items-center justify-between">
              {[
                { icon: <Lock className="w-3.5 h-3.5 text-muted-foreground" />, label: "უსაფრთხო" },
                { icon: <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />, label: "დაბრუნება" },
                { icon: <Truck className="w-3.5 h-3.5 text-muted-foreground" />, label: "სწრაფი" },
                { icon: <Phone className="w-3.5 h-3.5 text-muted-foreground" />, label: "მხარდაჭერა" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-0.5">
                  {item.icon}
                  <span className="text-[9px] font-semibold text-muted-foreground">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ══════ SECTION 2: Order Form ══════ */}
          <div ref={formSectionRef} className="checkout-card overflow-hidden">
            {showRecognizedCard ? (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-success/15 flex items-center justify-center">
                      <UserCheck className="w-3.5 h-3.5 text-success" />
                    </div>
                    <h2 className="text-sm font-bold text-foreground">შენი მონაცემები</h2>
                  </div>
                  <Button
                    variant="ghost" size="sm"
                    onClick={handleStartEditing}
                    className="text-xs text-primary font-semibold h-7 px-2 gap-1"
                  >
                    <Pencil className="w-3 h-3" />
                    შეცვლა
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5 space-y-1.5">
                  {[
                    { label: "ტელეფონი", value: form.phone },
                    { label: "ქალაქი", value: form.region },
                    { label: "მისამართი", value: form.address },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-xs font-semibold text-foreground text-right max-w-[60%]">{row.value || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">📦 სად მოგიტანოთ შეკვეთა?</h2>
                    <p className="text-[10px] text-muted-foreground">⚡ მხოლოდ 1 წუთი — შეავსე ინფორმაცია</p>
                  </div>
                  {isRecognized && isEditing && (
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}
                      className="text-xs text-muted-foreground font-medium h-7 px-2">
                      გაუქმება
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  {/* Phone input with flag prefix */}
                  <div>
                    <Label className="text-xs font-bold text-foreground">ტელეფონი</Label>
                    <div className="mt-0.5 phone-prefix-group flex">
                      <div className="phone-prefix-panel flex items-center gap-[5px] px-2 bg-[#f3f4f6] border-[1.5px] border-[#e5e7eb] border-r-0 rounded-l-xl">
                        <GeorgianFlag />
                        <span className="text-[13px] font-bold text-foreground/80">+995</span>
                        <div className="w-px h-4 bg-[#e5e7eb] ml-0.5" />
                      </div>
                      <Input
                        id="checkout-phone-input"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="5XX XXX XXX"
                        value={form.phone}
                        onChange={(e) => handleChange("phone", e.target.value)}
                        className="h-10 !text-base rounded-l-none rounded-r-xl border-[1.5px] border-[#e5e7eb] checkout-input flex-1"
                      />
                    </div>
                    {errors.phone && (
                      <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> {errors.phone}
                      </p>
                    )}
                  </div>

                  {/* Microcopy below phone */}
                  <div className="flex items-center gap-1.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg px-2 py-1.5">
                    <Phone className="w-3 h-3 text-[#166534] flex-shrink-0" />
                    <span className="text-[10px] font-medium text-[#166534]">კურიერი დაგიკავშირდებათ დასადასტურებლად</span>
                  </div>

                  {/* City and address — progressive reveal */}
                  <div
                    className="transition-all duration-[280ms] ease-out overflow-hidden"
                    style={{
                      maxHeight: phoneRevealed ? "350px" : "0px",
                      opacity: phoneRevealed ? 1 : 0,
                      transform: phoneRevealed ? "translateY(0)" : "translateY(6px)",
                    }}
                  >
                    <div className="space-y-2" ref={cityRef}>
                      <div>
                        <Label className="text-xs font-bold text-foreground">ქალაქი / რეგიონი</Label>
                        <div className="mt-0.5">
                          <PredictiveInput
                            value={form.region}
                            onChange={(val) => handleChange("region", val)}
                            onSelect={(s) => handleChange("region", s.text)}
                            onConfirm={handleCityConfirm}
                            getSuggestions={(input) => getCitySuggestions(input, historicalCities)}
                            placeholder="მაგ: თბილისი"
                            error={errors.region}
                            inputRef={cityInputRef}
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs font-bold text-foreground">მისამართი</Label>
                        <div className="mt-0.5">
                          <PredictiveInput
                            value={form.address}
                            onChange={(val) => handleChange("address", val)}
                            onSelect={(s) => handleChange("address", s.text)}
                            getSuggestions={(input) => getAddressSuggestions(input, form.region, historicalAddresses)}
                            placeholder="ქუჩა, სახლი, ბინა"
                            error={errors.address}
                            inputRef={addressInputRef}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ══════ SECTION 3: COD trust block — compact ══════ */}
          <div className="checkout-card px-3 py-2 flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
              <Truck className="w-3 h-3 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-[11px]">გადახდა მიტანისას</p>
              <p className="text-[10px] text-muted-foreground">ბარათით ან ნაღდით — კურიერს</p>
            </div>
          </div>

          {/* ══════ SECTION 4: Delivery info ══════ */}
          <div className="opacity-80">
            <DeliveryInfoBox />
          </div>

        </div>
      </div>

      {/* ══════ STICKY BOTTOM BAR: Ticker + CTA ══════ */}
      {/* Always rendered — switches between normal and compact mode */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-[100] transition-all duration-200"
        style={{
          background: keyboardOpen
            ? "hsl(var(--background))"
            : "linear-gradient(to top, hsl(var(--background)) 75%, transparent)",
          padding: keyboardOpen ? "0 10px 6px" : "0 10px 14px",
        }}
      >
        <div className="flex flex-col gap-1.5">

          {/* Ticker — hidden in compact/keyboard mode */}
          {!keyboardOpen && (
            <div className="bg-card rounded-lg overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.08)" }}>
              <div className="h-[2px] bg-muted relative">
                <div className="absolute left-0 top-0 h-full rounded-sm animate-bar-sweep" style={{ background: "linear-gradient(90deg, hsl(var(--primary)), #ff6b35)" }} />
              </div>
              <div className="flex items-center gap-1.5 px-3 py-[7px]" style={{ minHeight: 32 }}>
                <div className="w-4 flex items-center justify-center flex-shrink-0">
                  {tickerMsg.icon === "dot" ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] block animate-live-pulse" />
                  ) : (
                    <span className="text-xs leading-none">{tickerMsg.icon}</span>
                  )}
                </div>
                <div className="flex-1 overflow-hidden relative h-4">
                  <div
                    className="absolute text-[11px] font-semibold text-foreground whitespace-nowrap leading-4 transition-all"
                    style={{
                      transitionDuration: `${TRANS_MS}ms`,
                      transitionTimingFunction: "ease",
                      opacity: tickerPhase === "hold" ? 1 : 0,
                      transform: tickerPhase === "out" ? "translateY(-8px)" : tickerPhase === "in" ? "translateY(8px)" : "translateY(0)",
                    }}
                  >
                    {tickerMsg.text}
                  </div>
                </div>
                <div
                  className="flex-shrink-0 rounded-full px-2 py-[2px] text-[10px] font-bold whitespace-nowrap transition-opacity"
                  style={{
                    background: "hsl(var(--accent))",
                    color: "hsl(var(--primary))",
                    transitionDuration: `${TRANS_MS}ms`,
                    opacity: tickerVisible ? 1 : 0,
                  }}
                >
                  {tickerMsg.badge}
                </div>
              </div>
            </div>
          )}

          {/* Missing fields hint — shown in both modes */}
          {canCheckout && missingFields.length > 0 && !showRecognizedCard && (
            <p className={`text-center font-semibold text-destructive/80 animate-fade-in ${keyboardOpen ? "text-[9px]" : "text-[10px]"}`}>
              ⚠️ შეავსე: {missingFields.join(", ")}
            </p>
          )}

          {/* CTA — always tappable, compact when keyboard open */}
          <div className="relative">
            {!keyboardOpen && (
              <div className="absolute -top-[9px] right-3 bg-destructive text-destructive-foreground rounded-full px-2 py-[2px] flex items-center gap-0.5 z-10 cta-timer-pulse">
                <Clock className="w-[10px] h-[10px]" />
                <span className="text-[10px] font-extrabold tabular-nums tracking-[0.3px]">⏰ იწურება {countdown}-ში</span>
              </div>
            )}
            <Button
              onClick={handleCTAClick}
              disabled={submitting}
              className={`w-full font-bold rounded-xl transition-all duration-200 ${ctaColorClass} ${keyboardOpen ? "h-9 !text-[13px]" : "h-12 !text-[15px]"}`}
              size="lg"
            >
              {submitting
                ? "იგზავნება..."
                : canCheckout
                ? (isFormValid || showRecognizedCard ? "🔥 შეკვეთის დასრულება" : "🔥 შეავსე და შეუკვეთე")
                : `🔓 დაამატე კიდევ ${remaining} პროდუქტი`}
            </Button>
            {!keyboardOpen && canCheckout && (
              <p className="text-center text-[9px] font-semibold text-muted-foreground mt-0.5">გადახდა კურიერთან</p>
            )}
          </div>
        </div>
      </div>

      {/* ══════ Confirmation Modal ══════ */}
      <ConfirmOrderModal
        open={confirmModalOpen}
        amount={orderTotal}
        onConfirm={handleSubmitOrder}
        onCancel={() => setConfirmModalOpen(false)}
        submitting={submitting}
      />
    </div>
  );
};

export default Cart;
