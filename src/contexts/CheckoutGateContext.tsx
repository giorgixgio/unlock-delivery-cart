import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import SoftCheckoutSheet from "@/components/SoftCheckoutSheet";
import { Product } from "@/lib/constants";
import { toast } from "sonner";

interface CheckoutGateContextType {
  handleCheckoutIntent: (source: string) => void;
  addAndGate: (product: Product, source: string) => void;
  lastAddedProduct: Product | null;
}

const CheckoutGateContext = createContext<CheckoutGateContextType | undefined>(undefined);

/**
 * Compute a rough "savings" value for post-threshold items.
 * Uses the compare_at_price vs price delta when available,
 * otherwise estimates ~15% of the product price as perceived savings.
 */
function estimateSavings(product: Product): number {
  if (product.compareAtPrice && product.compareAtPrice > product.price) {
    return Math.round(product.compareAtPrice - product.price);
  }
  return Math.round(product.price * 0.15);
}

export const CheckoutGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isUnlocked, addItem, itemCount, threshold } = useCart();
  const { openCart } = useCartOverlay();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [source, setSource] = useState("");
  const [lastAddedProduct, setLastAddedProduct] = useState<Product | null>(null);
  const addCountRef = useRef(0);

  const proceedToCheckout = useCallback(() => {
    openCart();
  }, [openCart]);

  const handleCloseSheet = useCallback(() => setSheetOpen(false), []);

  const handleCheckoutIntent = useCallback(
    (src: string) => {
      if (isUnlocked) {
        openCart();
      } else {
        setSource(src);
        setSheetOpen(true);
      }
    },
    [isUnlocked, openCart]
  );

  const addAndGate = useCallback(
    (product: Product, src: string) => {
      addItem(product);
      setLastAddedProduct(product);
      addCountRef.current += 1;

      const postCount = itemCount + 1;
      const postRemaining = Math.max(0, threshold - postCount);

      // ── Reward toast logic ──
      if (postCount < threshold) {
        // Pre-threshold: show remaining count
        toast(`⚡ კიდევ ${postRemaining} პროდუქტი დარჩა`, { duration: 1500 });
      } else if (postCount === threshold) {
        // Exact threshold: unlock celebration
        toast("🎉 უფასო მიწოდება გააქტიურდა!", { duration: 2500 });
      } else {
        // Post-threshold: show savings
        const saved = estimateSavings(product);
        toast(`💰 დამატებითი დაზოგვა +${saved}₾`, { duration: 1800 });
      }

      // Open upsell sheet whenever still below threshold
      if (postCount < threshold) {
        setSource(src);
        setSheetOpen(true);
      }
    },
    [addItem, itemCount, threshold]
  );

  return (
    <CheckoutGateContext.Provider value={{ handleCheckoutIntent, addAndGate, lastAddedProduct }}>
      {children}
      <SoftCheckoutSheet
        open={sheetOpen}
        onClose={handleCloseSheet}
        onProceed={proceedToCheckout}
        source={source}
      />
    </CheckoutGateContext.Provider>
  );
};

export const useCheckoutGate = () => {
  const ctx = useContext(CheckoutGateContext);
  if (!ctx) throw new Error("useCheckoutGate must be used within CheckoutGateProvider");
  return ctx;
};
