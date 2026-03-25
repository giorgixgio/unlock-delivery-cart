/**
 * Centralized funnel tracking helper for the phone-first landing page funnel.
 * Wraps both PostHog (trackEvent) and Meta Pixel calls in one place.
 */
import { trackEvent } from "@/lib/analytics";
import {
  trackPurchase,
  trackLead,
  trackMetaUpsellView,
  trackMetaUpsellAccepted,
  trackMetaUpsellSkipped,
  trackMetaAddressSubmitted,
} from "@/lib/metaPixel";

// ── Helpers ──
function getUTMParams(): Record<string, string> {
  const params: Record<string, string> = {};
  try {
    const sp = new URLSearchParams(window.location.search);
    for (const key of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"]) {
      const val = sp.get(key);
      if (val) params[key] = val;
    }
  } catch {}
  return params;
}

// ═══════════════════════════════════════════════════
// 1. LANDING VIEW
// ═══════════════════════════════════════════════════
export function trackLandingView(params: {
  productId: string;
  productName: string;
  landingType: string;
}) {
  trackEvent("landing_view", {
    product_id: params.productId,
    product_name: params.productName,
    landing_type: params.landingType,
    ...getUTMParams(),
  });
}

// ═══════════════════════════════════════════════════
// 2. PHONE FORM VIEWED
// ═══════════════════════════════════════════════════
export function trackPhoneFormViewed(productId: string) {
  trackEvent("phone_form_viewed", {
    product_id: productId,
    order_flow: "phone_first",
  });
}

// ═══════════════════════════════════════════════════
// 3. PHONE SUBMITTED — MAIN CONVERSION
// ═══════════════════════════════════════════════════
export function trackPhoneSubmitted(params: {
  orderId: string;
  orderNumber: string;
  productId: string;
  productName: string;
  baseValue: number;
  landingSlug: string;
}) {
  // PostHog main conversion
  trackEvent("phone_submitted", {
    order_id: params.orderId,
    order_number: params.orderNumber,
    product_id: params.productId,
    product_name: params.productName,
    base_value: params.baseValue,
    currency: "GEL",
    source: "phone_submit",
    landing_slug: params.landingSlug,
  }, true); // flush immediately

  // Meta Purchase — fires NOW, base product value only, no shipping
  trackPurchase({
    value: params.baseValue,
    orderId: params.orderId,
    items: [{ id: params.productId, quantity: 1, price: params.baseValue }],
  });

  // Meta Lead as secondary signal
  trackLead({
    value: params.baseValue,
    orderId: params.orderId,
    productId: params.productId,
  });
}

// ═══════════════════════════════════════════════════
// 4. CONFIRMATION STEP
// ═══════════════════════════════════════════════════
export function trackConfirmationViewed(orderId: string, productId: string) {
  trackEvent("confirmation_step_viewed", {
    order_id: orderId,
    product_id: productId,
  });
}

export function trackConfirmationOfferClicked(orderId: string, productId: string) {
  trackEvent("confirmation_offer_clicked", {
    order_id: orderId,
    product_id: productId,
  });
}

export function trackConfirmationOfferSkipped(orderId: string, productId: string) {
  trackEvent("confirmation_offer_skipped", {
    order_id: orderId,
    product_id: productId,
  });
}

// ═══════════════════════════════════════════════════
// 5. UPSELL EVENTS
// ═══════════════════════════════════════════════════
export function trackUpsellViewed(params: {
  orderId: string;
  originalProductId: string;
  shownUpsellProductIds: string[];
  requiredBundleCount: number;
  bundlePrice: number;
}) {
  trackEvent("upsell_viewed", {
    order_id: params.orderId,
    original_product_id: params.originalProductId,
    shown_upsell_product_ids: params.shownUpsellProductIds,
    required_bundle_count: params.requiredBundleCount,
    bundle_price: params.bundlePrice,
  });
  trackMetaUpsellView(params.orderId);
}

export function trackUpsellItemSelected(orderId: string, upsellProductId: string, selectedCount: number) {
  trackEvent("upsell_item_selected", {
    order_id: orderId,
    upsell_product_id: upsellProductId,
    selected_count: selectedCount,
  });
}

export function trackUpsellItemDeselected(orderId: string, upsellProductId: string, selectedCount: number) {
  trackEvent("upsell_item_deselected", {
    order_id: orderId,
    upsell_product_id: upsellProductId,
    selected_count: selectedCount,
  });
}

export function trackUpsellCompleted(params: {
  orderId: string;
  selectedUpsellProductIds: string[];
  upsellBundleValue: number;
}) {
  trackEvent("upsell_completed", {
    order_id: params.orderId,
    selected_upsell_product_ids: params.selectedUpsellProductIds,
    upsell_bundle_value: params.upsellBundleValue,
    free_shipping_unlocked: true,
  });
  trackMetaUpsellAccepted(params.orderId, params.upsellBundleValue);
}

export function trackUpsellSkipped(orderId: string, selectedCountAtSkip: number) {
  trackEvent("upsell_skipped", {
    order_id: orderId,
    selected_count_at_skip: selectedCountAtSkip,
  });
  trackMetaUpsellSkipped(orderId);
}

// ═══════════════════════════════════════════════════
// 6. ADDRESS EVENTS
// ═══════════════════════════════════════════════════
export function trackAddressFormViewed(orderId: string) {
  trackEvent("address_form_viewed", { order_id: orderId });
}

export function trackAddressSubmitted(orderId: string, city: string) {
  trackEvent("address_submitted", {
    order_id: orderId,
    city,
    has_address: true,
  });
  trackMetaAddressSubmitted(orderId);
}

export function trackAddressAbandoned(orderId: string) {
  trackEvent("address_skipped_or_abandoned", { order_id: orderId });
}
