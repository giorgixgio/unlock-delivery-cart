import { useState, useEffect, memo } from "react";
import logoSrc from "@/assets/logo.png";
import { Product } from "@/lib/constants";
import { LandingConfig } from "@/hooks/useLandingConfig";
import { Button } from "@/components/ui/button";
import {
  Shield, Wifi, Eye, Clock, Truck, Banknote, ShoppingCart,
  Star, ChevronDown, ChevronUp, Radio, Scan, Battery, Smartphone,
  AlertTriangle, CheckCircle2, MapPin, Car, Hotel, Lock
} from "lucide-react";
import CountdownTimer from "@/components/landing/CountdownTimer";
import CODFormModal from "@/components/landing/CODFormModal";
import OrderConfirmationOverlay from "@/components/landing/OrderConfirmationOverlay";
import LandingUpsellSheet from "@/components/landing/LandingUpsellSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";

import { trackViewContent } from "@/lib/metaPixel";
import { trackLandingView } from "@/lib/funnelTracking";
import { useNavigate } from "react-router-dom";

interface SpyDetectorLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

/* ─── Reviews ─── */
const REVIEWS = [
  { name: "ნინო კ.", text: "სასტუმროში ვიყავი და ვიპოვე ფარული კამერა ბათრუმში. ეს მოწყობილობა სიცოცხლეს მიხსნის!", rating: 5 },
  { name: "გიორგი მ.", text: "მანქანაში GPS ტრეკერი აღმოვაჩინე. ძალიან მარტივი გამოსაყენებელია.", rating: 5 },
  { name: "მარიამი ს.", text: "ქირავნობის ბინაში შევამოწმე ყველა ოთახი — მშვიდობას არ დავდებ კომპრომისზე.", rating: 5 },
  { name: "დავითი ბ.", text: "ოფისში გამოვიყენე, რომ გამერკვია ხომ არ იყო მოსასმენი მოწყობილობა. სუპერი!", rating: 4 },
  { name: "ლევანი თ.", text: "მეგობარს ვაჩუქე — მოგზაურობისას ყოველთვის თან აქვს. რეკომენდაციაა.", rating: 5 },
];

const SPECS = [
  { key: "სიხშირის დიაპაზონი", value: "1MHz – 6.5GHz" },
  { key: "ინფრაწითელი LED", value: "12 ცალი" },
  { key: "ბატარეა", value: "25 საათამდე მუშაობა" },
  { key: "წონა", value: "~90 გრ" },
  { key: "ზომა", value: "კომპაქტური, ჯიბის ზომის" },
  { key: "დატენვა", value: "USB Type-C" },
];

/* ─── Social proof tickers ─── */
const ViewerCount = memo(() => {
  const [count] = useState(() => Math.floor(Math.random() * 60) + 120);
  return (
    <div className="flex items-center gap-1.5 text-xs text-white/60">
      <Eye className="w-3.5 h-3.5" />
      <span><strong className="text-white/90">{count}</strong> ადამიანმა ნახა ბოლო 24 საათში</span>
    </div>
  );
});
ViewerCount.displayName = "ViewerCount";

const LastOrderBadge = memo(() => {
  const [mins] = useState(() => Math.floor(Math.random() * 18) + 2);
  return (
    <div className="flex items-center gap-1.5 text-xs text-white/60">
      <Clock className="w-3.5 h-3.5 text-red-400" />
      <span>ბოლო შეკვეთა <strong className="text-red-400">{mins} წუთის წინ</strong></span>
    </div>
  );
});
LastOrderBadge.displayName = "LastOrderBadge";

/* ─── Main Component ─── */
const SpyDetectorLanding = ({ product, config: _config, landingSlug, landingVariant }: SpyDetectorLandingProps) => {
  const navigate = useNavigate();

  const UNIT_PRICE = product.price;
  const OLD_PRICE = 59.99;
  const DISCOUNT_PCT = Math.round((1 - UNIT_PRICE / OLD_PRICE) * 100);
  const [selectedQty, setSelectedQty] = useState(1);
  const [specsOpen, setSpecsOpen] = useState(false);
  
  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);

  const bundleOptions = [
    { qty: 1, label: "1 ცალი", discount_pct: 0 },
    { qty: 2, label: "2 ცალი – 10% ფასდაკლება", discount_pct: 10 },
    { qty: 3, label: "3 ცალი – 15% ფასდაკლება", discount_pct: 15 },
  ];
  const selectedOption = bundleOptions.find(o => o.qty === selectedQty) ?? bundleOptions[0];
  const bundleDiscount = selectedOption?.discount_pct ?? 0;
  const finalPrice = UNIT_PRICE * selectedQty * (1 - bundleDiscount / 100);

  useEffect(() => {
    trackViewContent(product);
    trackLandingView({ productId: product.id, productName: product.title, landingType: "spy-detector" });
  }, [product.id]);

  const handleCTA = () => {
    setCodOpen(true);
  };

  const handlePhoneOrderCreated = (orderId: string, orderNumber: string, orderTotal: number) => {
    setPendingOrderId(orderId);
    setPendingOrderNumber(orderNumber);
    setPendingOrderTotal(orderTotal);
    setCodOpen(false);
    setConfirmOpen(true);
  };

  const handleViewOffer = () => {
    setConfirmOpen(false);
    setUpsellOpen(true);
  };

  const handleSkipOffer = () => {
    setConfirmOpen(false);
    setDeliveryFee(5);
    setAddressOpen(true);
  };

  const handleUpsellComplete = (newDeliveryFee: number, newTotal: number) => {
    setDeliveryFee(newDeliveryFee);
    setPendingOrderTotal(newTotal - newDeliveryFee);
    setUpsellOpen(false);
    setAddressOpen(true);
  };

  const handleUpsellSkip = () => {
    setDeliveryFee(5);
    setUpsellOpen(false);
    setAddressOpen(true);
  };

  const handleAddressComplete = () => {
    setAddressOpen(false);
    navigate(`/success?order=${pendingOrderNumber}`);
  };

  const images = (product.images && product.images.length > 0) ? product.images : [product.image];

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white pb-36">
      {/* ── Urgency top banner ── */}
      <div className="bg-red-600 text-white text-center py-2 px-4">
        <p className="text-xs sm:text-sm font-bold animate-pulse">
          ⚡ მარაგშია მხოლოდ 12 ცალი — შეუკვეთეთ სანამ არ ამოიწურა!
        </p>
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-[#111111] border-b border-white/10 shadow-lg">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center justify-center">
          <img src={logoSrc} alt="BigMart" className="h-7 w-auto brightness-0 invert" />
        </div>
      </header>

      <div className="container max-w-2xl mx-auto px-4 pt-5 space-y-6">
        {/* ═══════ 1️⃣ HERO ═══════ */}
        <section className="space-y-4">
          {/* Product image */}
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-[#1a1a1a] border border-white/10 shadow-2xl">
            <img
              src={product.image}
              alt={product.title}
              className="w-full h-full object-cover"
              loading="eager"
            />
            <div className="absolute top-0 left-0 bg-red-600 text-white text-xs font-extrabold px-4 py-2 rounded-br-2xl">
              -{DISCOUNT_PCT}% ფასდაკლება
            </div>
            <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
              <p className="text-[10px] font-bold text-red-400">🔥 მარაგი მთავრდება</p>
            </div>
          </div>

          {/* Headline */}
          <div className="space-y-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
              დაიცავით თქვენი პირადი სივრცე ნებისმიერ გარემოში
            </h1>
            <p className="text-base text-white/60 leading-relaxed">
              პროფესიონალური დეტექტორი ფარული კამერების, მოსასმენი აპარატურის და GPS ტრეკერების აღმოსაჩენად.
            </p>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map(s => (
              <Star key={s} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
            ))}
            <span className="text-sm font-bold text-white ml-1">4.9</span>
            <span className="text-xs text-white/50">(347 შეფასება)</span>
          </div>

          {/* Price block */}
          <div className="bg-[#1a1a1a] rounded-2xl border border-red-500/30 p-5 space-y-2">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl font-extrabold text-red-500">{UNIT_PRICE} ₾</span>
              <span className="text-xl text-white/40 line-through">{OLD_PRICE} ₾</span>
              <span className="bg-red-600 text-white text-xs font-extrabold px-3 py-1 rounded-full">
                -{DISCOUNT_PCT}%
              </span>
            </div>
            <p className="text-xs font-bold text-red-400">⏰ ფასდაკლება მოქმედებს მხოლოდ დღეს</p>
          </div>

          {/* Social proof tickers */}
          <div className="flex flex-col gap-1">
            <ViewerCount />
            <LastOrderBadge />
          </div>

          {/* Trust badges — COD prominent */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
              <Banknote className="w-6 h-6 text-emerald-400" />
              <span className="text-[10px] font-bold text-white leading-tight">გადახდა კურიერთან</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-center">
              <Truck className="w-6 h-6 text-blue-400" />
              <span className="text-[10px] font-bold text-white leading-tight">უფასო მიწოდება</span>
            </div>
            <div className="flex flex-col items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
              <Shield className="w-6 h-6 text-amber-400" />
              <span className="text-[10px] font-bold text-white leading-tight">100% გარანტია</span>
            </div>
          </div>
        </section>

        {/* ═══════ 2️⃣ PROBLEM → SOLUTION ═══════ */}
        <section className="bg-[#141414] rounded-2xl border border-white/10 p-5 space-y-4">
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            რატომ გჭირდება ეს მოწყობილობა?
          </h2>
          <p className="text-sm text-white/60 leading-relaxed">
            გრძნობთ თავს დაცულად სასტუმროში ან გასახდელში? ნუ დატოვებთ თქვენს კონფიდენციალურობას შემთხვევითობის იმედად.
          </p>

          {/* Use cases */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Hotel, text: "სასტუმრო / Airbnb", desc: "ფარული კამერების აღმოჩენა" },
              { icon: Car, text: "ავტომობილი", desc: "GPS ტრეკერების პოვნა" },
              { icon: Lock, text: "გასახდელი", desc: "პირადი სივრცის დაცვა" },
              { icon: MapPin, text: "ოფისი", desc: "მოსასმენი აპარატურის შემოწმება" },
            ].map(({ icon: Icon, text, desc }, i) => (
              <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center space-y-2">
                <Icon className="w-7 h-7 text-red-400 mx-auto" />
                <p className="text-xs font-bold text-white">{text}</p>
                <p className="text-[10px] text-white/50">{desc}</p>
              </div>
            ))}
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
            <p className="text-sm font-bold text-white text-center">
              🛡️ დაიცავი შენი კონფიდენციალურობა — სანამ გვიან არ არის
            </p>
          </div>
        </section>

        {/* ═══════ 3️⃣ KEY FEATURES ═══════ */}
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold text-white text-center">რას აკეთებს?</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Radio, title: "ფართო დიაპაზონი", desc: "1MHz–6.5GHz სიგნალის აღმოჩენა", color: "text-blue-400" },
              { icon: Scan, title: "ინფრაწითელი სკანირება", desc: "კამერის ლინზების სწრაფი პოვნა", color: "text-red-400" },
              { icon: Smartphone, title: "კომპაქტური ზომა", desc: "ჯიბეში ეტევა, მარტივია სატარებლად", color: "text-emerald-400" },
              { icon: Battery, title: "25 საათი ბატარეა", desc: "ხანგრძლივი მუშაობის რეჟიმი", color: "text-amber-400" },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <div key={i} className="bg-[#1a1a1a] border border-white/10 rounded-xl p-4 space-y-2">
                <Icon className={`w-8 h-8 ${color}`} />
                <p className="text-sm font-extrabold text-white">{title}</p>
                <p className="text-[11px] text-white/50">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════ 4️⃣ HOW IT WORKS ═══════ */}
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold text-white text-center">როგორ მუშაობს?</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "ჩართე", desc: "დააჭირე ღილაკს", icon: "1", color: "bg-red-500" },
              { step: "სკანირე", desc: "შეამოწმე ოთახი", icon: "2", color: "bg-red-500" },
              { step: "იპოვე", desc: "აღმოაჩინე საფრთხე", icon: "3", color: "bg-red-500" },
            ].map((s, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4 text-center space-y-2">
                <div className={`w-10 h-10 ${s.color} rounded-full flex items-center justify-center mx-auto text-white font-extrabold text-lg`}>
                  {s.icon}
                </div>
                <p className="text-sm font-extrabold text-white">{s.step}</p>
                <p className="text-[11px] text-white/50">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════ 5️⃣ SOCIAL PROOF / REVIEWS ═══════ */}
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ვერიფიცირებული მომხმარებლები
          </h2>
          <div className="space-y-2.5">
            {REVIEWS.map((r, i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl border border-white/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-bold text-red-400">
                    {r.name.charAt(0)}
                  </div>
                  <span className="text-sm font-bold text-white">{r.name}</span>
                  <span className="text-[10px] text-emerald-400 font-semibold ml-1">✓ ვერიფიცირებული</span>
                  <div className="flex gap-0.5 ml-auto">
                    {Array.from({ length: r.rating }).map((_, j) => (
                      <Star key={j} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                    ))}
                  </div>
                </div>
                <p className="text-sm text-white/60 leading-relaxed">"{r.text}"</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════ 6️⃣ TECH SPECS ═══════ */}
        <section>
          <button
            onClick={() => setSpecsOpen(!specsOpen)}
            className="w-full flex items-center justify-between bg-[#1a1a1a] rounded-xl border border-white/10 p-4"
          >
            <span className="text-base font-extrabold text-white flex items-center gap-2">
              <Wifi className="w-4 h-4 text-red-400" />
              ტექნიკური მახასიათებლები
            </span>
            {specsOpen ? <ChevronUp className="w-5 h-5 text-white/50" /> : <ChevronDown className="w-5 h-5 text-white/50" />}
          </button>
          {specsOpen && (
            <div className="bg-[#1a1a1a] border border-t-0 border-white/10 rounded-b-xl p-4 space-y-2 -mt-1">
              {SPECS.map((s, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                  <span className="text-sm text-white/50">{s.key}</span>
                  <span className="text-sm font-bold text-white">{s.value}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═══════ 7️⃣ BUNDLE SELECTOR ═══════ */}
        <section className="space-y-3">
          <h2 className="text-lg font-extrabold text-white">აირჩიე რაოდენობა</h2>
          <div className="space-y-2">
            {bundleOptions.map(opt => {
              const isSelected = selectedQty === opt.qty;
              const totalBefore = UNIT_PRICE * opt.qty;
              const totalAfter = totalBefore * (1 - opt.discount_pct / 100);
              return (
                <button
                  key={opt.qty}
                  onClick={() => setSelectedQty(opt.qty)}
                  className={`relative w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-red-500 bg-red-500/10 shadow-lg shadow-red-500/20"
                      : "border-white/10 bg-[#1a1a1a] hover:border-red-500/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-red-500" : "border-white/30"}`}>
                      {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-red-500" />}
                    </div>
                    <span className="font-bold text-white text-sm">{opt.label}</span>
                  </div>
                  <div className="text-right">
                    {opt.discount_pct > 0 && (
                      <span className="text-xs text-white/40 line-through mr-2">{totalBefore.toFixed(2)} ₾</span>
                    )}
                    <span className="font-extrabold text-red-400 text-lg">{totalAfter.toFixed(2)} ₾</span>
                  </div>
                  {opt.discount_pct > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      -{opt.discount_pct}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* ═══════ 8️⃣ COUNTDOWN URGENCY ═══════ */}
        <section className="bg-gradient-to-br from-red-900/40 to-[#1a1a1a] rounded-2xl p-5 text-center space-y-3 border border-red-500/20">
          <h2 className="text-xl font-extrabold text-white">⏰ ფასდაკლება სრულდება მალე</h2>
          <div className="inline-block">
            <CountdownTimer minutes={27} />
          </div>
          <p className="text-sm text-white/50 font-semibold">მარაგშია მხოლოდ 12 ცალი</p>
        </section>

        {/* Extra product images */}
        {images.length > 1 && (
          <section className="space-y-2">
            <p className="text-sm font-bold text-white">პროდუქტის ფოტოები</p>
            <div className="grid grid-cols-2 gap-2">
              {images.slice(0, 4).map((img, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden bg-[#1a1a1a] border border-white/10">
                  <img src={typeof img === 'string' ? img : ''} alt={`${product.title} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ═══════ STICKY CTA ═══════ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#111111]/95 backdrop-blur-sm border-t border-white/10 p-3 shadow-[0_-4px_30px_rgba(220,38,38,0.15)]">
        <div className="container max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-xl font-extrabold text-red-500">{finalPrice.toFixed(2)} ₾</p>
            {bundleDiscount > 0 && (
              <p className="text-[10px] text-white/40 line-through">{(UNIT_PRICE * selectedQty).toFixed(2)} ₾</p>
            )}
          </div>
          <Button
            onClick={handleCTA}
            className="flex-1 h-16 rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/30 animate-[pulse_3s_ease-in-out_infinite] flex flex-col items-center justify-center gap-0.5 px-4"
            size="lg"
          >
            <span className="flex items-center gap-2 text-lg font-extrabold leading-tight">
              <ShoppingCart className="w-5 h-5" /> შეუკვეთე ახლა
            </span>
            <span className="text-[11px] font-medium text-white/70 leading-tight">მხოლოდ ტელეფონი</span>
          </Button>
        </div>
      </div>

      {/* Phone-Only COD Modal */}
      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={selectedQty}
        discountPct={bundleDiscount}
        landingSlug={landingSlug}
        landingVariant={landingVariant}
        onPhoneOrderCreated={handlePhoneOrderCreated}
      />

      {/* Order Confirmation Overlay */}
      <OrderConfirmationOverlay
        open={confirmOpen}
        orderId={pendingOrderId}
        productId={product.id}
        onViewOffer={handleViewOffer}
        onSkip={handleSkipOffer}
      />

      {/* Upsell Sheet */}
      <LandingUpsellSheet
        open={upsellOpen}
        onClose={() => { setUpsellOpen(false); setAddressOpen(true); }}
        orderId={pendingOrderId}
        baseProduct={product}
        basePrice={pendingOrderTotal}
        onComplete={handleUpsellComplete}
        onSkip={handleUpsellSkip}
      />

      {/* Address Form */}
      <AddressFormModal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        orderTotal={pendingOrderTotal}
        deliveryFee={deliveryFee}
        productId={product.id}
        quantity={selectedQty}
        unitPrice={UNIT_PRICE}
        landingSlug={landingSlug}
        onComplete={handleAddressComplete}
      />
    </div>
  );
};

export default SpyDetectorLanding;
