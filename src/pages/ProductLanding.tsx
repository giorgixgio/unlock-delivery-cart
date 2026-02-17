import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useProducts } from "@/hooks/useProducts";
import { useCart } from "@/contexts/CartContext";
import { useLandingPage } from "@/contexts/LandingPageContext";
import { useLandingConfig } from "@/hooks/useLandingConfig";
import { Product } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Plus, Minus, Truck, Banknote, ShoppingBag } from "lucide-react";
import { getDemoBadges, getFakeOldPrice, getDiscountPercent } from "@/lib/demoData";
import { MicroBenefitStacked } from "@/components/MicroBenefits";
import DeliveryInfoRow from "@/components/DeliveryInfoRow";
import { Skeleton } from "@/components/ui/skeleton";
import Cart from "@/pages/Cart";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import TailoredLanding from "@/components/landing/TailoredLanding";

const ProductLanding = () => {
  const { slug } = useParams();
  const { data: products = [], isLoading } = useProducts();
  const { addItem, updateQuantity, getQuantity } = useCart();
  const { isLandingPage, landingSlug } = useLandingPage();
  const { isCartOpen } = useCartOverlay();

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
  return <GenericLanding product={product} />;
};

/** Original generic landing page — unchanged behavior */
const GenericLanding = ({ product }: { product: Product }) => {
  const { addItem, updateQuantity, getQuantity } = useCart();
  const { isCartOpen } = useCartOverlay();

  const quantity = getQuantity(product.id);
  const oldPrice = getFakeOldPrice(product.id, product.price);
  const discount = getDiscountPercent(product.price, oldPrice);
  const badges = getDemoBadges(product.id);

  const handleAdd = () => addItem(product);
  const handleMinus = () => updateQuantity(product.id, quantity - 1);

  return (
    <>
      <div className="min-h-screen bg-background pb-32">
        <header className="sticky top-0 z-40 bg-card border-b border-border shadow-sm">
          <div className="container max-w-lg mx-auto px-4 py-3 text-center">
            <span className="text-lg font-extrabold text-primary tracking-tight">BIGMART</span>
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

        <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border p-4 shadow-lg">
          <div className="container max-w-lg mx-auto space-y-2">
            {quantity > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <Button onClick={handleMinus} variant="outline" size="icon" className="h-12 w-12 rounded-lg border-2">
                    <Minus className="w-5 h-5" />
                  </Button>
                  <span className="text-xl font-extrabold text-foreground min-w-[2rem] text-center">{quantity}</span>
                  <Button onClick={handleAdd} size="icon" className="h-12 w-12 rounded-lg">
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
                <LandingCheckoutButton />
              </div>
            ) : (
              <Button onClick={handleAdd} className="w-full h-14 text-lg font-bold rounded-xl" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                კალათაში დამატება
              </Button>
            )}
          </div>
        </div>
      </div>

      <Cart isOpen={isCartOpen} />
    </>
  );
};

const LandingCheckoutButton = () => {
  const { openCart } = useCartOverlay();
  return (
    <Button
      onClick={() => openCart()}
      className="flex-1 h-12 text-base font-bold rounded-xl bg-success hover:bg-success/90 text-success-foreground"
      size="lg"
    >
      შეკვეთა
    </Button>
  );
};

export default ProductLanding;
