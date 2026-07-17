import { useState, useEffect, memo } from "react";
import logoSrc from "@/assets/logo.png";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Wrench, Check, Star, ChevronDown, ChevronUp, Eye, Clock, ShoppingCart, ArrowLeft } from "lucide-react";
import CountdownTimer from "@/components/landing/CountdownTimer";
import LandingQuantitySelector from "@/components/landing/LandingQuantitySelector";
import LandingTrustRow from "@/components/landing/LandingTrustRow";
import LandingReviews from "@/components/landing/LandingReviews";

import { LandingConfig } from "@/hooks/useLandingConfig";
import { getDiscountedTotal, getQtyDiscountPct } from "@/lib/landingDiscounts";
import CODFormModal from "@/components/landing/CODFormModal";
import LandingUpsellSheet from "@/components/landing/LandingUpsellSheet";
import LandingDoneSheet from "@/components/landing/LandingDoneSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";
import { trackViewContent } from "@/lib/metaPixel";
import { trackLandingView, trackConfirmationViewed } from "@/lib/funnelTracking";
import { useNavigate } from "react-router-dom";

interface WrenchLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

const REVIEWS = [
  { name: "გიორგი მ.", text: "მანქანის საბურავი შევცვალე უპრობლემოდ. ძალიან მოსახერხებელია!", rating: 5 },
  { name: "დავითი ბ.", text: "სახლში ონკანი გამოვცვალე, ყველა ზომას ერგება.", rating: 5 },
  { name: "ლევანი კ.", text: "მანქანაში ყოველთვის თან მაქვს. არ ვიცი როგორ ვიყავი ამის გარეშე.", rating: 5 },
  { name: "ნიკა თ.", text: "ველოსიპედიც გავაკეთე და ავეჯიც ავაწყე. სუპერი ხარისხია.", rating: 4 },
];

const SPECS = [
  { key: "მასალა", value: "მაღალი ხარისხის ფოლადი" },
  { key: "ზომის დიაპაზონი", value: "7-19 მმ" },
  { key: "სიგრძე", value: "~20 სმ" },
  { key: "წონა", value: "~350 გრ" },
  { key: "კომპლექტი", value: "2 ცალი" },
];

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

const WrenchLanding = ({ product, config: _config, landingSlug }: WrenchLandingProps) => {
  const navigate = useNavigate();

  const UNIT_PRICE = product.price;
  const OLD_PRICE = Math.round(UNIT_PRICE * 1.65 * 100) / 100;
  const DISCOUNT_PCT = Math.round((1 - UNIT_PRICE / OLD_PRICE) * 100);

  const [selectedQty, setSelectedQty] = useState(1);
  const [specsOpen, setSpecsOpen] = useState(false);
  const totalPrice = getDiscountedTotal(UNIT_PRICE, selectedQty);
  const qtyDiscountPct = getQtyDiscountPct(selectedQty);

  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);

  useEffect(() => {
    trackViewContent(product);
    trackLandingView({ productId: product.id, productName: product.title, landingType: "wrench" });
  }, [product.id]);

  const handleCTA = () => setCodOpen(true);

  const goToSuccess = (onum: string) => navigate(`/success?order=${onum}`);

  const handlePhoneOrderCreated = (orderId: string, orderNumber: string, orderTotal: number) => {
    setPendingOrderId(orderId);
    setPendingOrderNumber(orderNumber);
    setPendingOrderTotal(orderTotal);
    setCodOpen(false);
    trackConfirmationViewed(orderId, product.id);
    // NEW ORDER: address first, upsell second.
    setDeliveryFee(5);
    setAddressOpen(true);
  };

  const handleUpsellComplete = (newDeliveryFee: number, newTotal: number) => {
    setDeliveryFee(newDeliveryFee);
    setPendingOrderTotal(newTotal - newDeliveryFee);
    setUpsellOpen(false);
    goToSuccess(pendingOrderNumber);
  };

  const handleUpsellSkip = () => { setUpsellOpen(false); goToSuccess(pendingOrderNumber); };
  const handleAddressComplete = () => { setAddressOpen(false); setUpsellOpen(true); };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-dark-surface border-b border-border/30 shadow-md">
        <div className="container max-w-2xl mx-auto px-4 py-3 flex items-center">
          <a href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </a>
          <img src={logoSrc} alt="BigMart" className="h-7 w-auto mx-auto brightness-0 invert" />
          <div className="w-8" />
        </div>
      </header>

      <div className="container max-w-2xl mx-auto px-4 pt-5 space-y-6">
        <CountdownTimer minutes={19} />

        {/* HERO */}
        <section className="space-y-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted border-2 border-border shadow-lg">
            <img src={product.image} alt={product.title} className="w-full h-full object-cover" loading="eager" />
            <div className="absolute top-0 left-0 bg-destructive text-white text-xs font-extrabold px-3 py-1.5 rounded-br-xl">
              -{DISCOUNT_PCT}% ფასდაკლება
            </div>
          </div>

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

          {/* Price */}
          <div className="bg-card rounded-xl border-2 border-primary/30 p-4 space-y-1">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</span>
              <span className="text-lg text-muted-foreground line-through">{(OLD_PRICE * selectedQty).toFixed(0)} ₾</span>
              <span className="bg-destructive text-white text-xs font-extrabold px-2 py-0.5 rounded-full">-{DISCOUNT_PCT}%</span>
            </div>
            {selectedQty > 1 && (
              <p className="text-xs text-muted-foreground">{selectedQty} ცალი × {UNIT_PRICE}₾</p>
            )}
          </div>

          {/* Social proof */}
          <div className="flex flex-col gap-1">
            <ViewerCount />
            <LastOrderBadge />
          </div>

          {/* Trust row */}
          <LandingTrustRow />
        </section>

        {/* PROBLEM → SOLUTION */}
        <section className="bg-card rounded-2xl border border-border p-5 space-y-4">
          <h2 className="text-xl font-extrabold text-foreground">რატომ გჭირდება ეს?</h2>
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
        </section>

        {/* HOW IT WORKS */}
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold text-foreground text-center">როგორ მუშაობს?</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: "მოარგე", icon: "🔧" },
              { step: "გადაატრიალე", icon: "🔄" },
              { step: "მზადაა", icon: "✅" },
            ].map((s, i) => (
              <div key={i} className="bg-card rounded-xl border border-border p-4 text-center space-y-2">
                <span className="text-3xl block">{s.icon}</span>
                <p className="text-sm font-extrabold text-foreground">{s.step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* QUANTITY SELECTOR */}
        <LandingQuantitySelector
          unitPrice={UNIT_PRICE}
          selectedQty={selectedQty}
          onSelect={setSelectedQty}
        />

        {/* REVIEWS */}
        <LandingReviews reviews={REVIEWS} />

        {/* TECH SPECS */}
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

        {/* URGENCY */}
        <section className="bg-dark-surface rounded-2xl p-5 text-center space-y-3">
          <h2 className="text-xl font-extrabold text-white">ფასდაკლება სრულდება მალე</h2>
          <div className="inline-block">
            <CountdownTimer minutes={19} />
          </div>
        </section>

        {/* Extra images */}
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

      {/* STICKY CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.12)]">
        <div className="container max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</p>
            {selectedQty > 1 && (
              <p className="text-[10px] text-muted-foreground">{selectedQty} ცალი</p>
            )}
          </div>
          <Button
            onClick={handleCTA}
            className="flex-1 h-14 text-lg font-extrabold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg animate-cta-pulse-success"
            size="lg"
          >
            <ShoppingCart className="w-5 h-5 mr-2" /> შეუკვეთე ახლა
          </Button>
        </div>
      </div>

      {/* Modals */}
      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={selectedQty}
        discountPct={qtyDiscountPct}
        landingSlug={landingSlug}
        landingVariant="wrench"
        onPhoneOrderCreated={handlePhoneOrderCreated}
      />
      <LandingUpsellSheet
        open={upsellOpen}
        onClose={() => { setUpsellOpen(false); goToSuccess(pendingOrderNumber); }}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        baseProduct={product}
        basePrice={pendingOrderTotal}
        onComplete={handleUpsellComplete}
        onSkip={handleUpsellSkip}
      />
      <AddressFormModal
        open={addressOpen}
        onClose={handleAddressComplete}
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

export default WrenchLanding;
