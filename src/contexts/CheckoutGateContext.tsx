import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import SoftCheckoutSheet from "@/components/SoftCheckoutSheet";
import { Product } from "@/lib/constants";
import { toast } from "sonner";

interface CheckoutGateContextType {
  handleCheckoutIntent: (source: string) => void;
  /** Add product to cart and immediately open threshold sheet if below minimum */
  addAndGate: (product: Product, source: string) => void;
  /** The last product added via addAndGate, for confirmation display */
  lastAddedProduct: Product | null;
}

const CheckoutGateContext = createContext<CheckoutGateContextType | undefined>(undefined);

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
      toast("დამატებულია ✅", { duration: 1200 });
      // Open upsell sheet whenever still below threshold; skip after threshold reached
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
