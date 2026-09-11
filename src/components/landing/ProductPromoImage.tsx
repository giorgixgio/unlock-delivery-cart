import { getProductLandingMedia } from "@/lib/productLandingMedia";

interface ProductPromoImageProps {
  sku: string | number | undefined | null;
}

const ProductPromoImage = ({ sku }: ProductPromoImageProps) => {
  const promo = getProductLandingMedia(sku)?.promoImage;
  if (!promo) return null;

  return (
    <figure className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <img
        src={promo.src}
        alt={promo.alt}
        className="aspect-square w-full object-cover"
        loading="eager"
      />
    </figure>
  );
};

export default ProductPromoImage;