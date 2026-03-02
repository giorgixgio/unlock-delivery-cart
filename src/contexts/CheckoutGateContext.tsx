import React, { createContext, useContext, useState, useCallback } from "react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import SoftCheckoutSheet from "@/components/SoftCheckoutSheet";
import { Product, DELIVERY_THRESHOLD } from "@/lib/constants";
import { toast } from "sonner";

interface CheckoutGateContextType {
  handleCheckoutIntent: (source: string) => void;
  /** Add product to cart and immediately open threshold sheet if below minimum */
  addAndGate: (product: Product, source: string) => void;
}

const CheckoutGateContext = createContext<CheckoutGateContextType | undefined>(undefined);

export const CheckoutGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isUnlocked, addItem, total } = useCart();
  const { openCart } = useCartOverlay();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [source, setSource] = useState("");

  const proceedToCheckout = useCallback(() => {
    openCart();
  }, [openCart]);

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
      // Compute post-add total
      const postTotal = total + product.price;
      if (postTotal >= DELIVERY_THRESHOLD) {
        toast("დამატებულია ✅", { duration: 1200 });
        openCart();
      } else {
        toast("დამატებულია ✅", { duration: 1200 });
        setSource(src);
        setSheetOpen(true);
      }
    },
    [addItem, total, openCart]
  );

  return (
    <CheckoutGateContext.Provider value={{ handleCheckoutIntent, addAndGate }}>
      {children}
      <SoftCheckoutSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
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
