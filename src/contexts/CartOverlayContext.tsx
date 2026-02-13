import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

interface CartOverlayContextType {
  isCartOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Silently dismiss overlay without history.back — use before programmatic navigation */
  dismissCart: () => void;
}

const CartOverlayContext = createContext<CartOverlayContextType | undefined>(undefined);

export const CartOverlayProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const savedScrollY = useRef(0);
  const isClosingRef = useRef(false);

  const openCart = useCallback(() => {
    if (isCartOpen) return;
    savedScrollY.current = window.scrollY;
    // Push a history entry so back button closes the cart
    window.history.pushState({ overlay: "cart" }, "", window.location.href);
    setIsCartOpen(true);
  }, [isCartOpen]);

  const closeCart = useCallback(() => {
    if (!isCartOpen || isClosingRef.current) return;
    isClosingRef.current = true;
    setIsCartOpen(false);

    // If history state has our overlay marker, go back to remove it
    if (window.history.state?.overlay === "cart") {
      window.history.back();
    }

    // Restore scroll position after DOM settles
    requestAnimationFrame(() => {
      window.scrollTo(0, savedScrollY.current);
      isClosingRef.current = false;
    });
  }, [isCartOpen]);

  const dismissCart = useCallback(() => {
    setIsCartOpen(false);
    isClosingRef.current = false;
  }, []);

  // Listen for popstate (browser back / iOS swipe-back)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If cart was open and we no longer have the overlay marker, close the UI
      if (isCartOpen && event.state?.overlay !== "cart") {
        setIsCartOpen(false);
        isClosingRef.current = false;
        requestAnimationFrame(() => {
          window.scrollTo(0, savedScrollY.current);
        });
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isCartOpen]);

  // Deep link: auto-open cart if ?cart=1 is present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("cart") === "1") {
      // Strip cart=1 from URL without adding history entry
      params.delete("cart");
      const newSearch = params.toString();
      const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
      window.history.replaceState(null, "", newUrl);
      // Open the cart
      savedScrollY.current = 0;
      window.history.pushState({ overlay: "cart" }, "", window.location.href);
      setIsCartOpen(true);
    }
  }, []);

  return (
    <CartOverlayContext.Provider value={{ isCartOpen, openCart, closeCart, dismissCart }}>
      {children}
    </CartOverlayContext.Provider>
  );
};

export const useCartOverlay = () => {
  const ctx = useContext(CartOverlayContext);
  if (!ctx) throw new Error("useCartOverlay must be used within CartOverlayProvider");
  return ctx;
};
