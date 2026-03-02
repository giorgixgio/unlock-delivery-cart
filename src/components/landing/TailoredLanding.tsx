import { useState, useEffect } from "react";
import { Product } from "@/lib/constants";
import { LandingConfig } from "@/hooks/useLandingConfig";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { Banknote, Truck, Shield, Package, ShoppingCart, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import BundleSelector from "@/components/landing/BundleSelector";
import LandingSections from "@/components/landing/LandingSections";
import CountdownTimer from "@/components/landing/CountdownTimer";
import ProductImageSlider from "@/components/landing/ProductImageSlider";
import ProductPhotoGallery from "@/components/landing/ProductPhotoGallery";
import DeliveryMissionBar from "@/components/DeliveryMissionBar";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import { useCheckoutGate } from "@/contexts/CheckoutGateContext";
import { trackViewContent } from "@/lib/metaPixel";

interface TailoredLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

const TailoredLanding = ({ product, config }: TailoredLandingProps) => {
  const { addItem, getQuantity, isUnlocked, remaining, itemCount } = useCart();
  const { openCart } = useCartOverlay();
  const { handleCheckoutIntent } = useCheckoutGate();

  const bundleEnabled = config.bundle?.enabled ?? false;
  const bundleOptions = config.bundle?.bundle_options ?? [{ qty: 1, label: `${product.title} × 1`, discount_pct: 0 }];
  const defaultQty = config.bundle?.default_qty ?? 1;

  const [selectedQty, setSelectedQty] = useState(defaultQty);

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  const quantity = getQuantity(product.id);

  // Track ViewContent on mount
  useEffect(() => {
    trackViewContent(product);
  }, [product.id]);

  // Split sections: benefits before bundle, faq after bundle
  const benefitSections = (config.sections || []).filter((s) => s.type !== "faq");
  const faqSections = (config.sections || []).filter((s) => s.type === "faq");

  const handleCTA = () => {
    // Add selected quantity to cart
    for (let i = 0; i < selectedQty; i++) {
      addItem(product);
    }
    // If threshold met, open cart; otherwise show threshold messaging
    if (isUnlocked || product.price * selectedQty + (itemCount > 0 ? 0 : 0) >= 19) {
      // Small delay to let cart state update
      setTimeout(() => openCart(), 100);
    } else {
      handleCheckoutIntent("landing_cta");
    }
  };

  const handleCheckout = () => {
    if (isUnlocked) {
      openCart();
    } else {
      handleCheckoutIntent("landing_cta");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-36">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="container max-w-lg mx-auto px-4 py-3 flex items-center">
          <a href="/" className="p-1.5 -ml-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </a>
          <span className="text-lg font-extrabold text-primary tracking-tight mx-auto">BIGMART</span>
          <div className="w-8" />
        </div>
      </header>

      <div className="container max-w-lg mx-auto px-4 pt-4 space-y-5">
        {/* Countdown timer */}
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

        {/* Product image slider */}
        <ProductImageSlider images={product.images || [product.image]} alt={product.title}>
          {discount > 0 && (
            <div className="absolute top-0 left-0 z-10 bg-deal text-deal-foreground text-xs font-extrabold px-3 py-1.5 rounded-br-xl">
              ↓ {discount}% OFF
            </div>
          )}
          {badges.length > 0 && (
            <div className="absolute top-10 left-2.5 z-10 flex flex-col gap-1.5">
              {badges.map((b) => (
                <span key={b} className="bg-badge text-badge-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                  {b}
                </span>
              ))}
            </div>
          )}
        </ProductImageSlider>

        {/* Title + price (if no hero_title) */}
        {!config.hero_title && (
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
        )}

        {/* COD + Fast Shipping hero banners */}
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3.5 bg-success/10 border-2 border-success/30 rounded-xl">
            <div className="w-11 h-11 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
              <Banknote className="w-6 h-6 text-success" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">💵 გადახდა მიტანისას</p>
              <p className="text-xs text-muted-foreground">კურიერს გადაუხდი ადგილზე — წინასწარი გადახდა არ არის საჭირო</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3.5 bg-primary/10 border-2 border-primary/30 rounded-xl">
            <div className="w-11 h-11 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Truck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">🚚 სწრაფი მიტანა</p>
              <p className="text-xs text-muted-foreground">შეკვეთა მიიღე 1-3 სამუშაო დღეში პირდაპირ კარამდე</p>
            </div>
          </div>
        </div>

        {/* Trust strip */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Shield, text: "ხარისხის გარანტია" },
            { icon: Package, text: "უსაფრთხო შეფუთვა" },
          ].map(({ icon: Icon, text }, i) => (
            <div
              key={i}
              className="flex items-center gap-2 py-2.5 px-3 bg-card rounded-xl border border-border shadow-sm"
            >
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[11px] font-semibold text-foreground leading-tight">{text}</span>
            </div>
          ))}
        </div>

        {/* Benefits sections */}
        {benefitSections.length > 0 && <LandingSections sections={benefitSections} />}

        {/* Bundle selector */}
        {bundleEnabled && bundleOptions.length > 1 && (
          <BundleSelector
            options={bundleOptions}
            selectedQty={selectedQty}
            onSelect={setSelectedQty}
            unitPrice={product.price}
          />
        )}

        {/* Delivery progress bar */}
        {itemCount > 0 && (
          <DeliveryMissionBar />
        )}

        {/* FAQ sections (after bundle) */}
        {faqSections.length > 0 && <LandingSections sections={faqSections} />}

        {/* Description */}
        {product.description && (
          <div
            className="text-sm text-muted-foreground leading-relaxed"
            dangerouslySetInnerHTML={{ __html: product.description }}
          />
        )}

        {/* Photo gallery of this product */}
        <ProductPhotoGallery images={product.images || []} alt={product.title} />
      </div>

      {/* Sticky CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-sm border-t border-border p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <div className="container max-w-lg mx-auto">
          {quantity > 0 ? (
            <Button
              onClick={handleCheckout}
              className={`w-full h-14 text-lg font-bold rounded-xl shadow-lg ${
                isUnlocked
                  ? "bg-success hover:bg-success/90 text-success-foreground animate-cta-pulse-success"
                  : "bg-accent text-foreground"
              }`}
              size="lg"
            >
              {isUnlocked ? (
                <><ShoppingCart className="w-5 h-5 mr-2" /> შეკვეთის დასრულება</>
              ) : (
                `🔓 დაამატე ${remaining.toFixed(1)} ₾ — გახსენი შეკვეთა`
              )}
            </Button>
          ) : (
            <Button
              onClick={handleCTA}
              className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg animate-cta-pulse-success"
              size="lg"
            >
              კალათაში დამატება — {product.price} ₾
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TailoredLanding;
