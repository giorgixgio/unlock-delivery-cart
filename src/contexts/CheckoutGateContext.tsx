import React, { createContext, useContext, useState, useCallback } from "react";
import { useCart } from "@/contexts/CartContext";
import { useCartOverlay } from "@/contexts/CartOverlayContext";
import SoftCheckoutSheet from "@/components/SoftCheckoutSheet";

interface CheckoutGateContextType {
  handleCheckoutIntent: (source: string) => void;
}

const CheckoutGateContext = createContext<CheckoutGateContextType | undefined>(undefined);

export const CheckoutGateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isUnlocked } = useCart();
  const { openCart } = useCartOverlay();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [source, setSource] = useState("");

  const proceedToCheckout = useCallback(() => {
    openCart();
  }, [openCart]);

  const handleCheckoutIntent = useCallback(
    (src: string) => {
      if (isUnlocked) {
        proceedToCheckout();
      } else {
        setSource(src);
        setSheetOpen(true);
      }
    },
    [isUnlocked, proceedToCheckout]
  );

  return (
    <CheckoutGateContext.Provider value={{ handleCheckoutIntent }}>
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
