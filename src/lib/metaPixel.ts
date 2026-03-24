declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// ── Deduplication: prevent double-firing Purchase on same order ──
let _lastPurchaseOrderId: string | null = null;

function debugLog(event: string) {
  console.log(`%c✅ Meta OK: ${event}`, "color:#1877F2;font-weight:bold");
}

// ── PageView (SPA route change) ──
export function trackPageView() {
  window.fbq?.("track", "PageView");
  debugLog("PageView");
}

// ── ViewContent ──
export function trackViewContent(product: { id: string; title: string; price: number }) {
  window.fbq?.("track", "ViewContent", {
    content_ids: [product.id],
    content_name: product.title,
    content_type: "product",
    value: product.price,
    currency: "GEL",
    num_items: 1,
  });
  debugLog("ViewContent");
}

// ── AddToCart ──
export function trackAddToCart(product: { id: string; title: string; price: number }) {
  window.fbq?.("track", "AddToCart", {
    content_ids: [product.id],
    content_name: product.title,
    content_type: "product",
    contents: [{ id: product.id, quantity: 1, item_price: product.price }],
    value: product.price,
    currency: "GEL",
    num_items: 1,
  });
  debugLog("AddToCart");
}

// ── InitiateCheckout ──
export function trackInitiateCheckout(params: {
  value: number;
  items: Array<{ id: string; quantity: number; price: number }>;
}) {
  window.fbq?.("track", "InitiateCheckout", {
    content_ids: params.items.map((i) => i.id),
    contents: params.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      item_price: i.price,
    })),
    content_type: "product",
    value: params.value,
    currency: "GEL",
    num_items: params.items.reduce((s, i) => s + i.quantity, 0),
  });
  debugLog("InitiateCheckout");
}

// ── Purchase ──
export function trackPurchase(params: {
  value: number;
  orderId?: string;
  items: Array<{ id: string; quantity: number; price: number }>;
}) {
  // Dedup: skip if same order already tracked this session
  if (params.orderId && params.orderId === _lastPurchaseOrderId) {
    console.log("%c⚠️ Meta SKIP: Purchase (duplicate)", "color:#F59E0B;font-weight:bold");
    return;
  }
  if (params.orderId) _lastPurchaseOrderId = params.orderId;

  window.fbq?.("track", "Purchase", {
    content_ids: params.items.map((i) => i.id),
    contents: params.items.map((i) => ({
      id: i.id,
      quantity: i.quantity,
      item_price: i.price,
    })),
    content_type: "product",
    value: params.value,
    currency: "GEL",
    num_items: params.items.reduce((s, i) => s + i.quantity, 0),
    ...(params.orderId && { order_id: params.orderId }),
  });
  debugLog("Purchase");
}
