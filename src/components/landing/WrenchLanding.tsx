import { useState, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Wrench, Check, Star, ChevronDown, ChevronUp, Eye, Clock, Truck, Banknote } from "lucide-react";
import CODFormModal from "@/components/landing/CODFormModal";
import BumpOfferModal from "@/components/landing/BumpOfferModal";
import CountdownTimer from "@/components/landing/CountdownTimer";
import { LandingConfig } from "@/hooks/useLandingConfig";

interface WrenchLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

/* ─── Fake social proof data ─── */
const REVIEWS = [
  { name: "გიორგი მ.", text: "მანქანის საბურავი შევცვალე უპრობლემოდ. ძალიან მოსახერხებელია!", rating: 5 },
  { name: "დავითი ბ.", text: "სახლში ონკანი გამოვცვალე, ყველა ზომას ერგება. რეკომენდაციაა!", rating: 5 },
  { name: "ლევანი კ.", text: "მანქანაში ყოველთვის თან მაქვს. არ ვიცი როგორ ვიყავი ამის გარეშე.", rating: 5 },
  { name: "ნიკა თ.", text: "ველოსიპედიც გავაკეთე და ავეჯიც ავაწყე ამით. სუპერი ხარისხია.", rating: 4 },
  { name: "ზურაბი გ.", text: "ფოლადი ძალიან კარგია, არ ცვდება. მეორეც შევუკვეთე მამას.", rating: 5 },
];

const SPECS = [
  { key: "მასალა", value: "მაღალი ხარისხის ფოლადი" },
  { key: "ზომის დიაპაზონი", value: "7-19 მმ" },
  { key: "სიგრძე", value: "~20 სმ" },
  { key: "წონა", value: "~350 გრ" },
  { key: "კომპლექტი", value: "2 ცალი" },
];

const HOW_IT_WORKS = [
  { step: "მოარგე", desc: "ქანჩზე დაადე", icon: "🔧" },
  { step: "გადაატრიალე", desc: "მოხერხებულად", icon: "🔄" },
  { step: "მზადაა", desc: "საქმე გაკეთდა", icon: "✅" },
];

/* ─── Social proof tickers ─── */
const ViewerCount = memo(() => {
  const [count] = useState(() => Math.floor(Math.random() * 40) + 85);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Eye className="w-3.5 h-3.5" />
      <span><strong className="text-foreground">{count}</strong> ადამიანმა ნახა ბოლო 24 საათში</span>
    </div>
  );
});
ViewerCount.displayName = "ViewerCount";

const LastOrderBadge = memo(() => {
  const [mins] = useState(() => Math.floor(Math.random() * 25) + 3);
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Clock className="w-3.5 h-3.5 text-success" />
      <span>ბოლო შეკვეთა <strong className="text-success">{mins} წუთის წინ</strong></span>
    </div>
  );
});
LastOrderBadge.displayName = "LastOrderBadge";

/* ─── Main Component ─── */
const WrenchLanding = ({ product, config, landingSlug, landingVariant }: WrenchLandingProps) => {
  const navigate = useNavigate();

  const UNIT_PRICE = product.price;
  const OLD_PRICE = Math.round(UNIT_PRICE * 1.65 * 100) / 100;
  const DISCOUNT_PCT = Math.round((1 - UNIT_PRICE / OLD_PRICE) * 100);

  // Bundle: 1pc full, 2pc 15% off
  const bundleOptions = config.bundle?.bundle_options ?? [
    { qty: 1, label: "1 კომპლექტი", discount_pct: 0 },
    { qty: 2, label: "2 კომპლექტი – 15% ფასდაკლება", discount_pct: 15 },
  ];
  const [selectedQty, setSelectedQty] = useState(config.bundle?.default_qty ?? 1);
  const selectedOption = bundleOptions.find((o) => o.qty === selectedQty) ?? bundleOptions[0];
  const bundleDiscount = selectedOption?.discount_pct ?? 0;
  const totalPrice = UNIT_PRICE * selectedQty * (1 - bundleDiscount / 100);

  // COD + bump state
  const [codOpen, setCodOpen] = useState(false);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; number: string; total: number } | null>(null);
  const [specsOpen, setSpecsOpen] = useState(false);

  const bumpConfig = config.bump;
  const bumpEnabled = bumpConfig?.enabled ?? false;

  const handleCTA = () => setCodOpen(true);

  const handleOrderCreated = (orderId: string, orderNumber: string, orderTotal: number) => {
    setCodOpen(false);
    if (bumpEnabled && bumpConfig) {
      setPendingOrder({ id: orderId, number: orderNumber, total: orderTotal });
      setBumpOpen(true);
    } else {
      navigate("/success", { state: { orderNumber, orderTotal }, replace: true });
    }
  };

  const handleBumpDone = (accepted: boolean) => {
    setBumpOpen(false);
    if (pendingOrder) {
      const finalTotal = accepted
        ? pendingOrder.total + UNIT_PRICE * (1 - (bumpConfig?.discount_pct ?? 0) / 100) * (bumpConfig?.bump_qty ?? 1)
        : pendingOrder.total;
      navigate("/success", { state: { orderNumber: pendingOrder.number, orderTotal: finalTotal }, replace: true });
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background pb-36">
        {/* ── Header ── */}
        <header className="sticky top-0 z-40 bg-dark-surface border-b border-border/30 shadow-md">
          <div className="container max-w-2xl mx-auto px-4 py-3 text-center">
            <span className="text-lg font-extrabold text-white tracking-widest">BIGMART</span>
          </div>
        </header>

        <div className="container max-w-2xl mx-auto px-4 pt-5 space-y-6">
          {/* ── Countdown ── */}
          <CountdownTimer minutes={19} />

          {/* ═══════════════════════════════════════════
              1️⃣  HERO SECTION
          ═══════════════════════════════════════════ */}
          <section className="space-y-4">
            {/* Product image */}
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted border-2 border-border shadow-lg">
              <img
                src={product.image}
                alt={product.title}
                className="w-full h-full object-cover"
                loading="eager"
              />
              <div className="absolute top-0 left-0 bg-destructive text-white text-xs font-extrabold px-3 py-1.5 rounded-br-xl">
                -{DISCOUNT_PCT}% ფასდაკლება
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground leading-tight">
                ერთი გასაღები ყველა ქანჩისთვის
              </h1>
              <p className="text-base text-muted-foreground leading-relaxed">
                დაივიწყე 10 სხვადასხვა გასაღები — ეს ერთი მოერგება ყველაფერს
              </p>
            </div>

            {/* Benefits checklist */}
            <div className="space-y-2">
              {[
                "რეგულირებადი მექანიზმი",
                "მანქანისთვის და სახლისთვის",
                "ძლიერი ფოლადი",
                "მუშაობს სხვადასხვა ზომაზე",
              ].map((b) => (
                <div key={b} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3.5 h-3.5 text-success" />
                  </div>
                  <span className="text-sm font-semibold text-foreground">{b}</span>
                </div>
              ))}
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star key={s} className={`w-4 h-4 ${s <= 4 ? "text-yellow-400 fill-yellow-400" : "text-yellow-400 fill-yellow-400/50"}`} />
              ))}
              <span className="text-sm font-bold text-foreground ml-1">4.8</span>
              <span className="text-xs text-muted-foreground">(214 შეფასება)</span>
            </div>

            {/* Price block */}
            <div className="bg-card rounded-xl border-2 border-primary/30 p-4 space-y-1">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-primary">{UNIT_PRICE} ₾</span>
                <span className="text-lg text-muted-foreground line-through">{OLD_PRICE.toFixed(2)} ₾</span>
                <span className="bg-destructive text-white text-xs font-extrabold px-2 py-0.5 rounded-full">-{DISCOUNT_PCT}%</span>
              </div>
              <p className="text-xs font-bold text-destructive">⏰ ფასდაკლება დღეს</p>
            </div>

            {/* Social proof tickers */}
            <div className="flex flex-col gap-1">
              <ViewerCount />
              <LastOrderBadge />
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-2.5 p-3 bg-success/5 border border-success/20 rounded-xl">
                <Banknote className="w-5 h-5 text-success flex-shrink-0" />
                <span className="text-xs font-bold text-foreground">გადახდა ადგილზე</span>
              </div>
              <div className="flex items-center gap-2.5 p-3 bg-primary/5 border border-primary/20 rounded-xl">
                <Truck className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-xs font-bold text-foreground">სწრაფი მიწოდება</span>
              </div>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              2️⃣  PROBLEM → SOLUTION
          ═══════════════════════════════════════════ */}
          <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
            <h2 className="text-xl font-extrabold text-foreground">რატომ გჭირდება ეს?</h2>

            {/* Before/After comparison */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 text-center space-y-2">
                <span className="text-3xl">😤</span>
                <p className="text-xs font-bold text-destructive">ბევრი გასაღები</p>
                <p className="text-[11px] text-muted-foreground">არცერთი არ ერგება</p>
              </div>
              <div className="bg-success/5 border border-success/20 rounded-xl p-3 text-center space-y-2">
                <span className="text-3xl">😎</span>
                <p className="text-xs font-bold text-success">ერთი უნივერსალური</p>
                <p className="text-[11px] text-muted-foreground">ყველაფერს ერგება</p>
              </div>
            </div>

            {/* Pain points */}
            <div className="space-y-2 pl-1">
              {[
                "არ გერგება ზომა?",
                "ქანჩი მრგვალდება?",
                "დროს კარგავ?",
              ].map((q) => (
                <p key={q} className="text-sm text-muted-foreground flex items-center gap-2">
                  <span className="text-destructive font-bold">✕</span> {q}
                </p>
              ))}
            </div>

            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
              <p className="text-sm font-bold text-foreground text-center">
                ✨ ეს ინსტრუმენტი ავტომატურად ერგება ზომას
              </p>
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              3️⃣  HOW IT WORKS
          ═══════════════════════════════════════════ */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-foreground text-center">როგორ მუშაობს?</h2>
            <div className="grid grid-cols-3 gap-3">
              {HOW_IT_WORKS.map((s, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-4 text-center space-y-2">
                  <span className="text-3xl block">{s.icon}</span>
                  <p className="text-sm font-extrabold text-foreground">{s.step}</p>
                  <p className="text-[11px] text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              4️⃣  SOCIAL PROOF / REVIEWS
          ═══════════════════════════════════════════ */}
          <section className="space-y-3">
            <h2 className="text-xl font-extrabold text-foreground">მომხმარებლების შეფასება</h2>
            <div className="space-y-2.5">
              {REVIEWS.map((r, i) => (
                <div key={i} className="bg-card rounded-xl border border-border p-3.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                      {r.name.charAt(0)}
                    </div>
                    <span className="text-sm font-bold text-foreground">{r.name}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {Array.from({ length: r.rating }).map((_, j) => (
                        <Star key={j} className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                      ))}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">"{r.text}"</p>
                </div>
              ))}
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              5️⃣  TECH SPECS (Collapsible)
          ═══════════════════════════════════════════ */}
          <section>
            <button
              onClick={() => setSpecsOpen(!specsOpen)}
              className="w-full flex items-center justify-between bg-card rounded-xl border border-border p-4"
            >
              <span className="text-base font-extrabold text-foreground flex items-center gap-2">
                <Wrench className="w-4 h-4 text-primary" />
                ტექნიკური მახასიათებლები
              </span>
              {specsOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
            </button>
            {specsOpen && (
              <div className="bg-card border border-t-0 border-border rounded-b-xl p-4 space-y-2 -mt-1">
                {SPECS.map((s, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                    <span className="text-sm text-muted-foreground">{s.key}</span>
                    <span className="text-sm font-bold text-foreground">{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ═══════════════════════════════════════════
              6️⃣  BUNDLE SELECTOR
          ═══════════════════════════════════════════ */}
          <section className="space-y-3">
            <h2 className="text-lg font-extrabold text-foreground">აირჩიე რაოდენობა</h2>
            <div className="space-y-2">
              {bundleOptions.map((opt) => {
                const isSelected = selectedQty === opt.qty;
                const totalBefore = UNIT_PRICE * opt.qty;
                const totalAfter = totalBefore * (1 - opt.discount_pct / 100);
                return (
                  <button
                    key={opt.qty}
                    onClick={() => setSelectedQty(opt.qty)}
                    className={`relative w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-primary" : "border-muted-foreground/40"}`}>
                        {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </div>
                      <span className="font-bold text-foreground text-sm">{opt.label}</span>
                    </div>
                    <div className="text-right">
                      {opt.discount_pct > 0 && (
                        <span className="text-xs text-muted-foreground line-through mr-2">{totalBefore.toFixed(2)} ₾</span>
                      )}
                      <span className="font-extrabold text-primary text-lg">{totalAfter.toFixed(2)} ₾</span>
                    </div>
                    {opt.discount_pct > 0 && (
                      <span className="absolute -top-2 -right-2 bg-destructive text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                        -{opt.discount_pct}%
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* ═══════════════════════════════════════════
              7️⃣  URGENCY BLOCK
          ═══════════════════════════════════════════ */}
          <section className="bg-dark-surface rounded-2xl p-5 text-center space-y-3">
            <h2 className="text-xl font-extrabold text-white">ფასდაკლება სრულდება მალე</h2>
            <div className="inline-block">
              <CountdownTimer minutes={19} />
            </div>
            <p className="text-sm text-white/60 font-semibold">⚡ რაოდენობა შეზღუდულია</p>
          </section>

          {/* Extra product images */}
          {product.images && product.images.length > 1 && (
            <section className="space-y-2">
              <p className="text-sm font-bold text-foreground">პროდუქტის ფოტოები</p>
              <div className="grid grid-cols-2 gap-2">
                {product.images.slice(0, 4).map((img, i) => (
                  <div key={i} className="aspect-square rounded-xl overflow-hidden bg-muted border border-border">
                    <img src={img} alt={`${product.title} ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ═══════════════════════════════════════════
            8️⃣  STICKY MOBILE CTA
        ═══════════════════════════════════════════ */}
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
          <div className="container max-w-2xl mx-auto flex items-center gap-3">
            <div className="flex-shrink-0">
              <p className="text-xl font-extrabold text-primary">{totalPrice.toFixed(2)} ₾</p>
              {bundleDiscount > 0 && (
                <p className="text-[10px] text-muted-foreground line-through">{(UNIT_PRICE * selectedQty).toFixed(2)} ₾</p>
              )}
            </div>
            <Button
              onClick={handleCTA}
              className="flex-1 h-14 text-lg font-extrabold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg animate-cta-pulse-success"
              size="lg"
            >
              შეკვეთა ახლა
            </Button>
          </div>
        </div>
      </div>

      {/* ── COD Modal ── */}
      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={selectedQty}
        discountPct={bundleDiscount}
        landingSlug={landingSlug}
        landingVariant={landingVariant}
        bumpEnabled={bumpEnabled}
        onOrderCreated={handleOrderCreated}
      />

      {/* ── Bump offer ── */}
      {bumpEnabled && bumpConfig && pendingOrder && (
        <BumpOfferModal
          open={bumpOpen}
          orderId={pendingOrder.id}
          product={product}
          bumpConfig={bumpConfig}
          originalQty={selectedQty}
          originalDiscount={bundleDiscount}
          onDone={handleBumpDone}
        />
      )}
    </>
  );
};

export default WrenchLanding;
