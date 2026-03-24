import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import { Product, CartItem, DELIVERY_FEE } from "@/lib/constants";
import { isProductOOS } from "@/lib/stockOverrideStore";
import { trackAddToCart } from "@/lib/metaPixel";
import { useThreshold } from "@/contexts/ThresholdContext";

const CART_STORAGE_KEY = "lb_cart";

function loadCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as CartItem[];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    if (items.length === 0) {
      localStorage.removeItem(CART_STORAGE_KEY);
    } else {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    }
  } catch {}
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  /** Number of additional products needed to reach minimum */
  remaining: number;
  isUnlocked: boolean;
  getQuantity: (productId: string) => number;
  uniqueItemCount: number;
  isFreeDelivery: boolean;
  shippingFee: number;
  orderTotal: number;
  /** Minimum product quantity required */
  threshold: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(loadCart);
  const threshold = useThreshold();

  useEffect(() => {
    saveCart(items);
  }, [items]);

  const addItem = useCallback((product: Product) => {
    if (isProductOOS(product.id, product.available)) {
      console.warn(`Blocked add-to-cart: product ${product.id} is out of stock`);
      return;
    }
    trackAddToCart(product);
    ttqTrackAddToCart(product);
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => {
          if (i.product.id === productId) {
            if (quantity > i.quantity && isProductOOS(productId, i.product.available)) {
              return i;
            }
            return { ...i, quantity };
          }
          return i;
        })
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const total = useMemo(() => Math.round(items.reduce((sum, i) => sum + i.product.price * i.quantity, 0) * 100) / 100, [items]);
  const itemCount = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const uniqueItemCount = items.length;
  // remaining = how many more products needed
  const remaining = Math.max(0, threshold - itemCount);
  const isUnlocked = remaining <= 0;
  const isFreeDelivery = true;
  const shippingFee = 0;
  const orderTotal = total;

  const getQuantity = useCallback(
    (productId: string) => items.find((i) => i.product.id === productId)?.quantity ?? 0,
    [items]
  );

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, clearCart, total, itemCount, remaining, isUnlocked, getQuantity, uniqueItemCount, isFreeDelivery, shippingFee, orderTotal, threshold }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
};
