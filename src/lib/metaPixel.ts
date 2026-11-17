declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// ── Deduplication: prevent double-firing Purchase on same order ──
let _lastPurchaseOrderId: string | null = null;

/** Owner tester device (scratch_tester=1) never sends Meta events. */
export function metaSuppressed(): boolean {
  try { return localStorage.getItem("scratch_tester") === "1"; } catch { return false; }
}
function fire(...args: unknown[]) {
  if (metaSuppressed()) return;
  window.fbq?.(...args);
}

function debugLog(event: string) {
  console.log(`%c✅ Meta OK: ${event}`, "color:#1877F2;font-weight:bold");
}

// ── PageView (SPA route change) ──
export function trackPageView() {
  fire("track", "PageView");
  debugLog("PageView");
}

// ── ViewContent ──
export function trackViewContent(product: { id: string; title: string; price: number }) {
  fire("track", "ViewContent", {
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
  fire("track", "AddToCart", {
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
  fire("track", "InitiateCheckout", {
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

// ── Lead (secondary signal on phone submission) ──
export function trackLead(params: {
  value: number;
  orderId?: string;
  productId: string;
}) {
  fire("track", "Lead", {
    value: params.value,
    currency: "GEL",
    content_category: "phone_order",
    ...(params.orderId && { eventID: params.orderId }),
  });
  debugLog("Lead");
}

// ── Purchase ──
// NOW fires on phone submission (order creation), NOT address completion
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

  fire("track", "Purchase", {
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
    ...(params.orderId && { eventID: params.orderId }),
  });
  debugLog("Purchase");
}

// ── Custom funnel events ──

export function trackMetaUpsellView(orderId: string) {
  fire("trackCustom", "UpsellView", { order_id: orderId });
  debugLog("UpsellView");
}

export function trackMetaUpsellAccepted(orderId: string, value: number) {
  fire("trackCustom", "UpsellAccepted", {
    order_id: orderId,
    value,
    currency: "GEL",
  });
  debugLog("UpsellAccepted");
}

export function trackMetaUpsellSkipped(orderId: string) {
  fire("trackCustom", "UpsellSkipped", { order_id: orderId });
  debugLog("UpsellSkipped");
}

export function trackMetaAddressSubmitted(orderId: string) {
  fire("trackCustom", "AddressSubmitted", { order_id: orderId });
  debugLog("AddressSubmitted");
}

// ── Stockout (out-of-stock buyer intent) ──
// Fires INSTEAD OF Purchase/Lead when the product is sold out at submit time.
export function trackStockoutAttempt(params: {
  productId: string;
  productName?: string;
  sku?: string | null;
  value?: number;
}) {
  fire("trackCustom", "OutOfStockAttempt", {
    content_ids: [params.productId],
    content_name: params.productName,
    content_type: "product",
    sku: params.sku,
    value: params.value ?? 0,
    currency: "GEL",
  });
  debugLog("OutOfStockAttempt");
}
