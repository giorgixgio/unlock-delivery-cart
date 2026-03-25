import { useMemo, useEffect, useState, lazy, Suspense } from "react";
import logoSrc from "@/assets/logo.png";
import { useParams, useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { useLandingConfig } from "@/hooks/useLandingConfig";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Truck, Banknote, ShoppingBag, ShoppingCart, ArrowLeft } from "lucide-react";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { MicroBenefitStacked } from "@/components/MicroBenefits";
import DeliveryInfoRow from "@/components/DeliveryInfoRow";
import CODFormModal from "@/components/landing/CODFormModal";
import LandingUpsellSheet from "@/components/landing/LandingUpsellSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";

import { Skeleton } from "@/components/ui/skeleton";
import TailoredLanding from "@/components/landing/TailoredLanding";
import WrenchLanding from "@/components/landing/WrenchLanding";
import { trackViewContent } from "@/lib/metaPixel";

const ProductLanding = () => {
  const { slug } = useParams();
  const { data: products = [], isLoading } = useProducts();
  const { landingSlug } = useLandingPage();

  const product = useMemo(() => {
    if (!slug || products.length === 0) return null;
    return products.find((p) => p.handle === slug || p.id === slug) ?? null;
  }, [slug, products]);

  const { data: landingConfig, isLoading: configLoading } = useLandingConfig(
    product?.handle || slug
  );

  if (isLoading || configLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container max-w-lg mx-auto px-4 pt-8 space-y-4">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-lg text-muted-foreground">პროდუქტი ვერ მოიძებნა</p>
      </div>
    );
  }

  // Custom spy detector landing
  if (landingConfig && landingConfig.landing_variant === "custom-spy-detector") {
    const SpyDetectorLanding = lazy(() => import("@/components/landing/SpyDetectorLanding"));
    return (
      <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <SpyDetectorLanding
          product={product}
          config={landingConfig.landing_config || {}}
          landingSlug={landingSlug || slug || ""}
          landingVariant={landingConfig.landing_variant}
          useCodModal={landingConfig.landing_use_cod_modal}
        />
      </Suspense>
    );
  }

  // Custom wrench landing
  if (landingConfig && landingConfig.landing_variant === "custom-wrench") {
    return (
      <WrenchLanding
        product={product}
        config={landingConfig.landing_config || {}}
        landingSlug={landingSlug || slug || ""}
        landingVariant={landingConfig.landing_variant}
        useCodModal={landingConfig.landing_use_cod_modal}
      />
    );
  }

  // If tailored config exists, render TailoredLanding
  if (landingConfig && landingConfig.landing_variant.startsWith("tailored")) {
    return (
      <TailoredLanding
        product={product}
        config={landingConfig.landing_config || {}}
        landingSlug={landingSlug || slug || ""}
        landingVariant={landingConfig.landing_variant}
        useCodModal={landingConfig.landing_use_cod_modal}
      />
    );
  }

  // Generic landing (existing behavior)
  return <GenericLanding product={product} landingSlug={landingSlug || slug || ""} />;
};

/** Generic landing page — phone-first funnel */
const GenericLanding = ({ product, landingSlug }: { product: Product; landingSlug: string }) => {
  const navigate = useNavigate();

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);

  // Track ViewContent on mount
  useEffect(() => {
    trackViewContent(product);
  }, [product.id]);

  const handleCTA = () => setCodOpen(true);

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

  return (
    <div className="min-h-screen bg-background pb-48">
      <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
        <div className="container max-w-lg mx-auto px-4 py-3 flex items-center">
          <a href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <img src={logoSrc} alt="BigMart" className="h-7 w-auto mx-auto" />
          <div className="w-8" />
        </div>
      </header>

      <div className="container max-w-lg mx-auto px-4 pt-4 space-y-4">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
          <img src={product.image} alt={product.title} className="w-full h-full object-cover" />
          {discount > 0 && (
            <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-2.5 py-1 rounded-br-lg">
              ↓ {discount}% OFF
            </div>
          )}
          {badges.length > 0 && (
            <div className="absolute top-8 left-2 z-10 flex flex-col gap-1">
              {badges.map((b) => (
                <span key={b} className="bg-badge text-badge-foreground text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 className="text-xl font-extrabold text-foreground leading-tight">{product.title}</h1>
          <div className="flex items-center gap-2.5 mt-2 flex-wrap">
            <span className="text-2xl font-extrabold text-primary">{product.price} ₾</span>
            <span className="text-base text-muted-foreground line-through">{oldPrice.toFixed(2)} ₾</span>
            {discount > 0 && (
              <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{discount}%</span>
            )}
          </div>
        </div>

        <MicroBenefitStacked />
        <DeliveryInfoRow />

        <div className="flex items-center justify-around py-3 border-y border-border bg-accent/30 rounded-lg">
          <div className="flex flex-col items-center gap-1">
            <Banknote className="w-5 h-5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">გადახდა მიტანისას</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <Truck className="w-5 h-5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">კურიერით მიტანა</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <span className="text-[11px] font-semibold text-foreground">მარტივი შეკვეთა</span>
          </div>
        </div>

        {product.description && (
          <div
            className="text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        )}
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-4 shadow-lg">
        <div className="container max-w-lg mx-auto">
          <Button
            onClick={handleCTA}
            className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg"
            size="lg"
          >
            <ShoppingCart className="w-5 h-5 mr-2" /> შეუკვეთე ახლა
          </Button>
        </div>
      </div>

      {/* Phone-Only COD Modal */}
      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={1}
        discountPct={0}
        landingSlug={landingSlug}
        landingVariant="generic"
        onPhoneOrderCreated={handlePhoneOrderCreated}
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
        quantity={1}
        unitPrice={product.price}
        landingSlug={landingSlug}
        onComplete={handleAddressComplete}
      />
    </div>
  );
};

export default ProductLanding;
