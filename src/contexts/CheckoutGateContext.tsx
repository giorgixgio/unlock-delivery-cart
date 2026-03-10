import React, { createContext, useContext, useState, useCallback } from "react";
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
  const { isUnlocked, addItem, total, threshold } = useCart();
  const { openCart } = useCartOverlay();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [source, setSource] = useState("");
  const [lastAddedProduct, setLastAddedProduct] = useState<Product | null>(null);

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
      // Compute post-add total with rounding to avoid floating-point issues
      const postTotal = Math.round((total + product.price) * 10) / 10;
      toast("დამატებულია ✅", { duration: 1200 });
      if (postTotal >= threshold) {
        openCart();
      } else {
        setSource(src);
        setSheetOpen(true);
      }
    },
    [addItem, total, openCart, threshold]
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
