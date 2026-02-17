import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Product } from "@/lib/constants";
import { LandingConfig, BundleOption } from "@/hooks/useLandingConfig";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { Banknote, Truck, Shield, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import BundleSelector from "@/components/landing/BundleSelector";
import LandingSections from "@/components/landing/LandingSections";
import CODFormModal from "@/components/landing/CODFormModal";
import BumpOfferModal from "@/components/landing/BumpOfferModal";
import CountdownTimer from "@/components/landing/CountdownTimer";
import ProductImageSlider from "@/components/landing/ProductImageSlider";
import ProductPhotoGallery from "@/components/landing/ProductPhotoGallery";

interface TailoredLandingProps {
  product: Product;
  config: LandingConfig;
  landingSlug: string;
  landingVariant: string;
  useCodModal: boolean;
}

const TailoredLanding = ({ product, config, landingSlug, landingVariant, useCodModal }: TailoredLandingProps) => {
  const navigate = useNavigate();

  const bundleEnabled = config.bundle?.enabled ?? false;
  const bundleOptions = config.bundle?.bundle_options ?? [{ qty: 1, label: `${product.title} × 1`, discount_pct: 0 }];
  const defaultQty = config.bundle?.default_qty ?? 1;

  const [selectedQty, setSelectedQty] = useState(defaultQty);
  const [codOpen, setCodOpen] = useState(false);
  const [bumpOpen, setBumpOpen] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<{ id: string; number: string; total: number } | null>(null);

  const selectedOption = bundleOptions.find((o) => o.qty === selectedQty) ?? bundleOptions[0];
  const discountPct = selectedOption?.discount_pct ?? 0;
  const totalAfter = product.price * selectedQty * (1 - discountPct / 100);

  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  const bumpConfig = config.bump;
  const bumpEnabled = bumpConfig?.enabled ?? false;

  // Split sections: benefits before bundle, faq after bundle
  const benefitSections = (config.sections || []).filter((s) => s.type !== "faq");
  const faqSections = (config.sections || []).filter((s) => s.type === "faq");

  const handleCTA = () => {
    if (useCodModal) setCodOpen(true);
  };

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
        ? pendingOrder.total + product.price * (1 - (bumpConfig?.discount_pct ?? 0) / 100) * (bumpConfig?.bump_qty ?? 1)
        : pendingOrder.total;
      navigate("/success", {
        state: { orderNumber: pendingOrder.number, orderTotal: finalTotal },
        replace: true,
      });
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background pb-36">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-sm border-b border-border shadow-sm">
          <div className="container max-w-lg mx-auto px-4 py-3 text-center">
            <span className="text-lg font-extrabold text-primary tracking-tight">TETRI.SHOP</span>
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
            <Button
              onClick={handleCTA}
              className="w-full h-14 text-lg font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground shadow-lg animate-cta-pulse-success"
              size="lg"
            >
              შეკვეთა — {totalAfter.toFixed(2)} ₾
            </Button>
          </div>
        </div>
      </div>

      <CODFormModal
        open={codOpen}
        onClose={() => setCodOpen(false)}
        product={product}
        quantity={selectedQty}
        discountPct={discountPct}
        landingSlug={landingSlug}
        landingVariant={landingVariant}
        bumpEnabled={bumpEnabled}
        onOrderCreated={handleOrderCreated}
      />

      {bumpEnabled && bumpConfig && pendingOrder && (
        <BumpOfferModal
          open={bumpOpen}
          orderId={pendingOrder.id}
          product={product}
          bumpConfig={bumpConfig}
          originalQty={selectedQty}
          originalDiscount={discountPct}
          onDone={handleBumpDone}
        />
      )}
    </>
  );
};

export default TailoredLanding;
