import { useMemo, useEffect, useState, lazy, Suspense } from "react";
import logoSrc from "@/assets/logo.png";
import { useParams, useNavigate } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { useLandingConfig } from "@/hooks/useLandingConfig";
import { useGlobalUpsellsEnabled, resolveUpsellEnabled } from "@/hooks/useUpsellsEnabled";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowLeft } from "lucide-react";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { getDiscountedTotal, getQtyDiscountPct, getOriginalTotal } from "@/lib/landingDiscounts";
import ProductImageSlider from "@/components/landing/ProductImageSlider";
import StickyAnnouncementBar from "@/components/landing/StickyAnnouncementBar";
import LandingTrustRow from "@/components/landing/LandingTrustRow";
import LandingReviews from "@/components/landing/LandingReviews";
import LandingBulletDescription from "@/components/landing/LandingBulletDescription";
import LandingQuantitySelector from "@/components/landing/LandingQuantitySelector";
import CODFormModal from "@/components/landing/CODFormModal";
import LandingUpsellSheet from "@/components/landing/LandingUpsellSheet";
import LandingDoneSheet from "@/components/landing/LandingDoneSheet";
import AddressFormModal from "@/components/landing/AddressFormModal";

import { Skeleton } from "@/components/ui/skeleton";
import TailoredLanding from "@/components/landing/TailoredLanding";
import WrenchLanding from "@/components/landing/WrenchLanding";
import { trackViewContent } from "@/lib/metaPixel";
import { trackLandingView, trackConfirmationViewed } from "@/lib/funnelTracking";

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
        upsellOverride={landingConfig.landing_upsell_enabled}
      />
    );
  }

  // Generic landing (existing behavior)
  return (
    <GenericLanding
      product={product}
      landingSlug={landingSlug || slug || ""}
      upsellOverride={landingConfig?.landing_upsell_enabled ?? null}
    />
  );
};

/** Generic landing page — phone-first funnel */
const GenericLanding = ({
  product,
  landingSlug,
  upsellOverride,
}: {
  product: Product;
  landingSlug: string;
  upsellOverride: boolean | null;
}) => {
  const navigate = useNavigate();
  const { data: globalUpsellsEnabled } = useGlobalUpsellsEnabled();
  const upsellsActive = resolveUpsellEnabled(globalUpsellsEnabled, upsellOverride);

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  const [selectedQty, setSelectedQty] = useState(1);
  const totalPrice = getDiscountedTotal(product.price, selectedQty);
  
  const qtyDiscountPct = getQtyDiscountPct(selectedQty);

  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [addressOpen, setAddressOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);

  useEffect(() => {
    trackViewContent(product);
    trackLandingView({ productId: product.id, productName: product.title, landingType: "generic" });
  }, [product.id]);

  const handleCTA = () => setCodOpen(true);

  const goToSuccess = (orderNumber: string) => navigate(`/success?order=${orderNumber}`);

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

  const afterAddress = (onum: string) => {
    setAddressOpen(false);
    if (upsellsActive) setUpsellOpen(true);
    else goToSuccess(onum);
  };

  const handleUpsellComplete = (newDeliveryFee: number, newTotal: number) => {
    setDeliveryFee(newDeliveryFee);
    setPendingOrderTotal(newTotal - newDeliveryFee);
    setUpsellOpen(false);
    goToSuccess(pendingOrderNumber);
  };

  const handleUpsellSkip = () => { setUpsellOpen(false); goToSuccess(pendingOrderNumber); };
  const handleAddressComplete = () => afterAddress(pendingOrderNumber);

  return (
    <div className="min-h-screen bg-background pb-36">
      <StickyAnnouncementBar />
      <header className="sticky top-[28px] z-40 bg-card border-b border-border shadow-sm">
        <div className="container max-w-lg mx-auto px-4 py-3 flex items-center">
          <a href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <img src={logoSrc} alt="BigMart" className="h-7 w-auto mx-auto" />
          <div className="w-8" />
        </div>
      </header>

      <div
        className="container max-w-lg mx-auto px-4 space-y-5"
        style={{ paddingTop: "calc(28px + env(safe-area-inset-top))" }}
      >
        {/* Product image slider */}
        <ProductImageSlider images={product.images?.length > 0 ? product.images : [product.image]} alt={product.title}>
          {discount > 0 && (
            <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-2.5 py-1 rounded-br-lg">
              ↓ {discount}% ფასდაკლება
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
        </ProductImageSlider>


        <div>
          <h1 className="text-xl font-extrabold text-foreground leading-tight">{product.title}</h1>
          {product.sku && (
            <p className="text-[11px] text-muted-foreground font-mono mt-1">SKU: {product.sku}</p>
          )}
          <div className="flex items-baseline gap-2.5 mt-2 flex-wrap">
            <span className="text-3xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</span>
            {(qtyDiscountPct > 0 || discount > 0) && (
              <span className="text-base text-muted-foreground line-through">{(oldPrice * selectedQty).toFixed(0)} ₾</span>
            )}
            {qtyDiscountPct > 0 && (
              <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{qtyDiscountPct}%</span>
            )}
          </div>
        </div>

        {/* Trust row */}
        <LandingTrustRow />

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
        landingVariant="generic"
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
        unitPrice={product.price}
        landingSlug={landingSlug}
        onComplete={handleAddressComplete}
      />
    </div>
  );
};

export default ProductLanding;
