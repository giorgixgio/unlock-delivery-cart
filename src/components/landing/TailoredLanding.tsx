import { useState, useEffect } from "react";
import logoSrc from "@/assets/logo.png";
import { Product } from "@/lib/constants";
import { useGlobalUpsellsEnabled, resolveUpsellEnabled } from "@/hooks/useUpsellsEnabled";
import { LandingConfig } from "@/hooks/useLandingConfig";
import { getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { getDiscountedTotal, getQtyDiscountPct } from "@/lib/landingDiscounts";
import { ShoppingCart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingQuantitySelector from "@/components/landing/LandingQuantitySelector";
import LandingTrustRow from "@/components/landing/LandingTrustRow";
import LandingReviews from "@/components/landing/LandingReviews";
import LandingBulletDescription from "@/components/landing/LandingBulletDescription";
import LandingSections from "@/components/landing/LandingSections";
import CountdownTimer from "@/components/landing/CountdownTimer";
import ProductImageSlider from "@/components/landing/ProductImageSlider";
import ProductPhotoGallery from "@/components/landing/ProductPhotoGallery";
import CODFormModal from "@/components/landing/CODFormModal";
import OrderConfirmationOverlay from "@/components/landing/OrderConfirmationOverlay";
import LandingUpsellSheet from "@/components/landing/LandingUpsellSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";
import { trackViewContent } from "@/lib/metaPixel";
import { trackLandingView } from "@/lib/funnelTracking";
import { useNavigate } from "react-router-dom";

interface TailoredLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

const TailoredLanding = ({ product, config, landingSlug }: TailoredLandingProps) => {
  const navigate = useNavigate();

  const [selectedQty, setSelectedQty] = useState(1);

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const totalPrice = getDiscountedTotal(product.price, selectedQty);
  const qtyDiscountPct = getQtyDiscountPct(selectedQty);

  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);

  useEffect(() => {
    trackViewContent(product);
    trackLandingView({ productId: product.id, productName: product.title, landingType: "tailored" });
  }, [product.id]);

  const benefitSections = (config.sections || []).filter((s) => s.type !== "faq");
  const faqSections = (config.sections || []).filter((s) => s.type === "faq");

  const handleCTA = () => setCodOpen(true);

  const handlePhoneOrderCreated = (orderId: string, orderNumber: string, orderTotal: number) => {
    setPendingOrderId(orderId);
    setPendingOrderNumber(orderNumber);
    setPendingOrderTotal(orderTotal);
    setCodOpen(false);
    setConfirmOpen(true);
  };

  const handleViewOffer = () => { setConfirmOpen(false); setUpsellOpen(true); };
  const handleSkipOffer = () => { setConfirmOpen(false); setDeliveryFee(5); setAddressOpen(true); };

  const handleUpsellComplete = (newDeliveryFee: number, newTotal: number) => {
    setDeliveryFee(newDeliveryFee);
    setPendingOrderTotal(newTotal - newDeliveryFee);
    setUpsellOpen(false);
    setAddressOpen(true);
  };

  const handleUpsellSkip = () => { setDeliveryFee(5); setUpsellOpen(false); setAddressOpen(true); };
  const handleAddressComplete = () => { setAddressOpen(false); navigate(`/success?order=${pendingOrderNumber}`); };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container max-w-lg mx-auto px-4 py-3 flex items-center">
          <a href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <img src={logoSrc} alt="BigMart" className="h-7 w-auto mx-auto" />
          <div className="w-8" />
        </div>
      </header>

      <div className="container max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Countdown */}
        <CountdownTimer minutes={19} />

        {/* Hero title */}
        {config.hero_title && (
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-extrabold text-foreground leading-tight">{config.hero_title}</h1>
            {config.hero_subtitle && (
              <p className="text-sm text-muted-foreground">{config.hero_subtitle}</p>
            )}
          </div>
        )}

        {/* Product image */}
        <ProductImageSlider images={product.images || [product.image]} alt={product.title}>
          {discount > 0 && (
            <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-3 py-1.5 rounded-br-xl">
              ↓ {discount}% OFF
            </div>
          )}
        </ProductImageSlider>

        {/* Title + price */}
        <div>
          {!config.hero_title && (
            <>
              <h1 className="text-xl font-extrabold text-foreground leading-tight mb-1">{product.title}</h1>
              {product.sku && (
                <p className="text-[11px] text-muted-foreground font-mono mb-2">SKU: {product.sku}</p>
              )}
            </>
          )}
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</span>
            <span className="text-lg text-muted-foreground line-through">{(oldPrice * selectedQty).toFixed(0)} ₾</span>
            {discount > 0 && (
              <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{discount}%</span>
            )}
          </div>
        </div>

        {/* Trust row */}
        <LandingTrustRow />

        {/* Benefits sections */}
        {benefitSections.length > 0 && <LandingSections sections={benefitSections} />}

        {/* Description as bullets */}
        {product.description && (
          <LandingBulletDescription description={product.description} />
        )}

        {/* Quantity selector */}
        <LandingQuantitySelector
          unitPrice={product.price}
          selectedQty={selectedQty}
          onSelect={setSelectedQty}
        />

        {/* Reviews */}
        <LandingReviews />

        {/* FAQ sections */}
        {faqSections.length > 0 && <LandingSections sections={faqSections} />}

        {/* Photo gallery */}
        <ProductPhotoGallery images={product.images || []} alt={product.title} />
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="container max-w-lg mx-auto flex items-center gap-3">
          <div className="flex-shrink-0">
            <p className="text-xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</p>
            {selectedQty > 1 && (
              <p className="text-[10px] text-muted-foreground">{selectedQty} ცალი</p>
            )}
          </div>
          <Button
            onClick={handleCTA}
            className="flex-1 h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg animate-cta-pulse-success"
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
        landingVariant="tailored"
        onPhoneOrderCreated={handlePhoneOrderCreated}
      />
      <OrderConfirmationOverlay
        open={confirmOpen}
        orderId={pendingOrderId}
        productId={product.id}
        onViewOffer={handleViewOffer}
        onSkip={handleSkipOffer}
      />
      <LandingUpsellSheet
        open={upsellOpen}
        onClose={() => { setUpsellOpen(false); setAddressOpen(true); }}
        orderId={pendingOrderId}
        baseProduct={product}
        basePrice={pendingOrderTotal}
        onComplete={handleUpsellComplete}
        onSkip={handleUpsellSkip}
      />
      <AddressFormModal
        open={addressOpen}
        onClose={() => setAddressOpen(false)}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        orderTotal={pendingOrderTotal}
        deliveryFee={deliveryFee}
        productId={product.id}
        quantity={selectedQty}
        unitPrice={product.price}
        landingSlug={landingSlug}
        onComplete={handleAddressComplete}
      />
    </div>
  );
};

export default TailoredLanding;
