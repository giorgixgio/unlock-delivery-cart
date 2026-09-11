import { useMemo, useEffect, useState, lazy, Suspense } from "react";
import logoSrc from "@/assets/logo.png";
import { useParams, useNavigate } from "react-router-dom";
import { useProducts, useStorefrontProducts } from "@/hooks/useProducts";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { useLandingConfig } from "@/hooks/useLandingConfig";
import { useGlobalUpsellsEnabled, resolveUpsellEnabled } from "@/hooks/useUpsellsEnabled";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { ShoppingCart, ArrowLeft, Gift, Truck } from "lucide-react";
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
import RepeatOrderBlock from "@/components/landing/RepeatOrderBlock";
import { readLastOrder, saveLastOrder, markIntentionalRepeat, type LastOrderRecord } from "@/lib/lastOrderStore";
import { trackEvent } from "@/lib/analytics";
import SingleUpsellSheet from "@/components/landing/SingleUpsellSheet";
import { getSingleUpsellOffer } from "@/lib/singleUpsellOffers";
import OnePlusOneOffer from "@/components/landing/OnePlusOneOffer";
import FreeGiftCard from "@/components/landing/FreeGiftCard";
import { getFreeGiftOffer } from "@/lib/freeGiftOffers";
import ProductDemoGif from "@/components/landing/ProductDemoGif";
import ProductPromoImage from "@/components/landing/ProductPromoImage";
import SkuUrgencyTimer from "@/components/landing/SkuUrgencyTimer";
import BumpOfferModal from "@/components/landing/BumpOfferModal";
import { getProductLandingMedia } from "@/lib/productLandingMedia";
import type { BumpConfig } from "@/hooks/useLandingConfig";



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
      onePlusOneEnabled={landingConfig?.offer_1plus1_enabled ?? false}
      offerTimerMinutes={landingConfig?.offer_timer_minutes ?? 59}
    />
  );
};

/** Generic landing page — phone-first funnel */
const GenericLanding = ({
  product,
  landingSlug,
  upsellOverride,
  onePlusOneEnabled,
  offerTimerMinutes,
}: {
  product: Product;
  landingSlug: string;
  upsellOverride: boolean | null;
  onePlusOneEnabled: boolean;
  offerTimerMinutes: number;
}) => {

  const navigate = useNavigate();
  const { data: storefrontProducts = [] } = useStorefrontProducts();
  const { data: globalUpsellsEnabled } = useGlobalUpsellsEnabled();

  // Per-product single-item offer (shown right after phone submit)
  const singleOffer = getSingleUpsellOffer(product.sku);
  const singleOfferProduct = useMemo(
    () => (singleOffer ? storefrontProducts.find((p) => String(p.sku) === singleOffer.offerSku) ?? null : null),
    [singleOffer, storefrontProducts]
  );
  const singleOfferActive = !!(singleOffer && singleOfferProduct);

  // Pre-selected free gift for every order of this SKU
  const giftOffer = getFreeGiftOffer(product.sku);
  const giftProduct = useMemo(
    () => (giftOffer ? storefrontProducts.find((p) => String(p.sku) === giftOffer.giftSku) ?? null : null),
    [giftOffer, storefrontProducts]
  );

  // When a single offer is configured, the generic multi-product upsell is disabled.
  const upsellsActive =
    !singleOfferActive && resolveUpsellEnabled(globalUpsellsEnabled, upsellOverride);


  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  const [selectedQty, setSelectedQty] = useState(1);

  // 1+1 offer: 2 units for the price of one (50% off the 2-unit total)
  const effectiveQty = onePlusOneEnabled ? 2 : selectedQty;
  const qtyDiscountPct = onePlusOneEnabled ? 50 : getQtyDiscountPct(selectedQty);
  const totalPrice = onePlusOneEnabled
    ? product.price
    : getDiscountedTotal(product.price, selectedQty);


  // Funnel state
  const [codOpen, setCodOpen] = useState(false);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [singleUpsellOpen, setSingleUpsellOpen] = useState(false);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const [addressOpen, setAddressOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [pendingOrderId, setPendingOrderId] = useState("");
  const [pendingOrderNumber, setPendingOrderNumber] = useState("");
  const [pendingOrderTotal, setPendingOrderTotal] = useState(0);
  const [deliveryFee, setDeliveryFee] = useState(5);
  const [repeatBlocked, setRepeatBlocked] = useState<LastOrderRecord | null>(null);
  const landingMedia = getProductLandingMedia(product.sku);
  const hasSku002QuantityOffer = String(product.sku) === "002";
  const sku002BumpConfig: BumpConfig = {
    enabled: true,
    type: "additional_item",
    discount_pct: 34,
    bump_qty: 1,
    fixed_price: 19,
    title: "დაამატე და დაზოგე",
    subtitle: "დაამატე კიდევ ერთი კამერა მხოლოდ 19₾-ად",
  };

  useEffect(() => {
    trackViewContent(product);
    trackLandingView({ productId: product.id, productName: product.title, landingType: "generic" });
    const last = readLastOrder(product.sku || product.id);
    if (last) {
      setRepeatBlocked(last);
      trackEvent("duplicate_block_shown", { sku: last.sku, orderNumber: last.orderNumber });
    }
  }, [product.id]);

  const handleReorder = () => {
    markIntentionalRepeat(product.sku || product.id);
    setRepeatBlocked(null);
  };

  const handleCTA = () => setCodOpen(true);

  const goToSuccess = (orderNumber: string) => navigate(`/success?order=${orderNumber}`);

  const handlePhoneOrderCreated = (orderId: string, orderNumber: string, orderTotal: number, phone?: string) => {
    setPendingOrderId(orderId);
    setPendingOrderNumber(orderNumber);
    setPendingOrderTotal(orderTotal);
    setCodOpen(false);
    trackConfirmationViewed(orderId, product.id);
    saveLastOrder({
      orderNumber,
      sku: product.sku || product.id,
      productName: product.title,
      phone: phone || "",
      createdAt: Date.now(),
    });
    // NEW ORDER: single offer (if configured) → address → done.
    setDeliveryFee(5);
    if (hasSku002QuantityOffer && effectiveQty < 2) setBumpOpen(true);
    else if (hasSku002QuantityOffer) setAddressOpen(true);
    else if (singleOfferActive) setSingleUpsellOpen(true);
    else setAddressOpen(true);
  };

  const handleBumpDone = (accepted: boolean) => {
    if (accepted) setPendingOrderTotal((current) => current + 15);
    setBumpOpen(false);
    if (hasSku002QuantityOffer) setAddressOpen(true);
    else if (singleOfferActive) setSingleUpsellOpen(true);
    else setAddressOpen(true);
  };

  const handleSingleUpsellDone = (_accepted: boolean, newSubtotal: number) => {
    setPendingOrderTotal(newSubtotal);
    setSingleUpsellOpen(false);
    if (hasSku002QuantityOffer) setDoneOpen(true);
    else setAddressOpen(true);
  };


  const afterAddress = (onum: string) => {
    setAddressOpen(false);
    if (hasSku002QuantityOffer && singleOfferActive) setSingleUpsellOpen(true);
    else if (upsellsActive) setUpsellOpen(true);
    else goToSuccess(onum);
  };

  const handleUpsellComplete = (newDeliveryFee: number, newTotal: number) => {
    setDeliveryFee(newDeliveryFee);
    setPendingOrderTotal(newTotal - newDeliveryFee);
    setUpsellOpen(false);
    setDoneOpen(true);
  };

  const handleUpsellSkip = () => { setUpsellOpen(false); setDoneOpen(true); };
  const handleAddressComplete = () => afterAddress(pendingOrderNumber);
  const handleDoneClose = () => setDoneOpen(false);

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
        {/* 1+1 sticky offer banner (per-product) */}
        {onePlusOneEnabled && !repeatBlocked && (
          <div className="sticky top-[76px] z-30 bg-background py-2">
            <OnePlusOneOffer
              slug={product.handle || landingSlug}
              unitPrice={product.price}
              timerMinutes={offerTimerMinutes}
              onOrder={handleCTA}
            />
          </div>
        )}

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
              <span className="text-base text-muted-foreground line-through">{(oldPrice * effectiveQty).toFixed(0)} ₾</span>
            )}
            {qtyDiscountPct > 0 && (
              <span className="bg-deal text-deal-foreground text-xs font-extrabold px-2 py-0.5 rounded">-{qtyDiscountPct}%</span>
            )}
            {onePlusOneEnabled && (
              <span className="text-xs font-bold text-destructive">2 ცალი ერთი ფასად</span>
            )}
          </div>

        </div>

        {/* Pre-selected free gift */}
        {giftOffer && giftProduct && (
          <FreeGiftCard offer={giftOffer} giftProduct={giftProduct} />
        )}

        {/* SKU-002 urgency hook + delivery separator + promo creative */}
        {hasSku002QuantityOffer && <SkuUrgencyTimer />}

        {hasSku002QuantityOffer && (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-success/25 bg-success/8 px-4 py-2.5">
            <Truck className="h-4 w-4 text-success" aria-hidden="true" />
            <span className="text-sm font-bold text-success">
              მიწოდება ყველა ქალაქში და სოფელში
            </span>
          </div>
        )}

        {/* Per-product promotional creative */}
        <ProductPromoImage sku={product.sku} />

        {/* Trust row */}
        <LandingTrustRow />

        {/* Animated "see it in action" demo (per-SKU) */}
        <ProductDemoGif sku={product.sku} />

        {/* Description as bullets */}
        {product.description && (
          <LandingBulletDescription
            description={product.description}
            preserveAuthoredFormatting={landingMedia?.preserveAuthoredDescription}
          />
        )}

        {/* Quantity selector (hidden while the 1+1 offer fixes qty at 2) */}
        {!onePlusOneEnabled && (
          <LandingQuantitySelector
            unitPrice={product.price}
            selectedQty={selectedQty}
            onSelect={setSelectedQty}
          />
        )}


        {/* Reviews */}
        <LandingReviews />
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="container max-w-lg mx-auto">
          {repeatBlocked ? (
            <RepeatOrderBlock orderNumber={repeatBlocked.orderNumber} onReorder={handleReorder} />
          ) : (
            <>
            {giftOffer && giftProduct && (
              <p className="mb-1.5 flex items-center justify-center gap-1 text-[11px] font-extrabold text-success">
                <Gift className="h-3.5 w-3.5" /> საჩუქარი შეკვეთაზე — უფასოდ
              </p>
            )}
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0">
                <p className="text-xl font-extrabold text-primary">{totalPrice.toFixed(0)} ₾</p>
                {effectiveQty > 1 && (
                  <p className="text-[10px] text-muted-foreground">{effectiveQty} ცალი</p>
                )}
              </div>
              <Button
                onClick={handleCTA}
                className="flex-1 min-h-14 rounded-xl bg-success px-2 text-sm font-bold leading-tight text-success-foreground shadow-lg hover:bg-success/90 animate-cta-pulse-success sm:text-base"
                size="lg"
              >
                <ShoppingCart className="h-5 w-5 mr-1.5 flex-shrink-0" />
                <span className="whitespace-normal">
                  {onePlusOneEnabled ? "შეუკვეთე 2 ცალი ერთი ფასად" : "შეუკვეთე ახლა"}
                </span>
              </Button>

            </div>
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={effectiveQty}
        discountPct={qtyDiscountPct}
        landingSlug={landingSlug}
        landingVariant="generic"
        onPhoneOrderCreated={handlePhoneOrderCreated}
        onDuplicateBlocked={(orderNumber, createdAt) => {
          const rec = { orderNumber, sku: product.sku || product.id, productName: product.title, phone: "", createdAt: new Date(createdAt).getTime() };
          saveLastOrder(rec);
          setRepeatBlocked(rec);
          setCodOpen(false);
        }}
        giftProduct={giftProduct}


      />
      {hasSku002QuantityOffer && (
        <BumpOfferModal
          open={bumpOpen}
          orderId={pendingOrderId}
          product={product}
          bumpConfig={sku002BumpConfig}
          basePrice={pendingOrderTotal}
          deliveryFee={deliveryFee}
          onDone={handleBumpDone}
        />
      )}
      {singleOfferActive && singleOffer && singleOfferProduct && (
        <SingleUpsellSheet
          open={singleUpsellOpen}
          orderId={pendingOrderId}
          orderNumber={pendingOrderNumber}
          offer={singleOffer}
          offerProduct={singleOfferProduct}
          basePrice={pendingOrderTotal}
          deliveryFee={deliveryFee}
          onDone={handleSingleUpsellDone}
        />
      )}
      <LandingUpsellSheet

        open={upsellOpen}
        onClose={() => { setUpsellOpen(false); setDoneOpen(true); }}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        baseProduct={product}
        basePrice={pendingOrderTotal}
        onComplete={handleUpsellComplete}
        onSkip={handleUpsellSkip}
      />
      <LandingDoneSheet
        open={doneOpen}
        onClose={handleDoneClose}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        deliveryFee={deliveryFee}
        total={pendingOrderTotal + deliveryFee}
      />
      <AddressFormModal
        open={addressOpen}
        onClose={handleAddressComplete}
        orderId={pendingOrderId}
        orderNumber={pendingOrderNumber}
        orderTotal={pendingOrderTotal}
        deliveryFee={deliveryFee}
        productId={product.id}
        quantity={effectiveQty}
        unitPrice={product.price}
        landingSlug={landingSlug}
        onComplete={handleAddressComplete}
      />
    </div>
  );
};

export default ProductLanding;
