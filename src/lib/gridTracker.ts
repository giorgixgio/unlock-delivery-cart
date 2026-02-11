import { supabase } from "@/integrations/supabase/client";

// Session ID persisted per tab
let sessionId: string | null = null;
function getSessionId(): string {
  if (!sessionId) {
    sessionId = sessionStorage.getItem("grid_session_id");
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem("grid_session_id", sessionId);
    }
  }
  return sessionId;
}

interface GridEventPayload {
  event_type: string;
  product_id?: string;
  grid_position?: number;
  grid_section?: string;
  hero_product_id?: string;
  scroll_depth?: number;
  metadata?: Record<string, unknown>;
}

// Fire-and-forget insert — don't block UI
export function trackGridEvent(payload: GridEventPayload) {
  const row = {
    ...payload,
    session_id: getSessionId(),
    metadata: payload.metadata ?? {},
  };

  // Use requestIdleCallback or setTimeout to avoid blocking
  const send = () => {
    supabase
      .from("grid_events")
      .insert(row as any)
      .then(({ error }) => {
        if (error) console.warn("[grid_tracker]", error.message);
      });
  };

  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(send);
  } else {
    setTimeout(send, 0);
  }
}

// Convenience helpers
export function trackHeroAddToCart(productId: string) {
  trackGridEvent({ event_type: "hero_add_to_cart", product_id: productId, grid_position: 0, grid_section: "hero" });
}

export function trackRelatedAddToCart(productId: string, position: number) {
  trackGridEvent({ event_type: "related_add_to_cart", product_id: productId, grid_position: position, grid_section: "related" });
}

export function trackRandomAddToCart(productId: string, position: number, section: string) {
  trackGridEvent({ event_type: "random_add_to_cart", product_id: productId, grid_position: position, grid_section: section });
}

export function trackGridPositionClicked(productId: string, position: number, section: string) {
  trackGridEvent({ event_type: "grid_position_clicked", product_id: productId, grid_position: position, grid_section: section });
}

export function trackScrollDepth(depth: number, heroProductId?: string) {
  trackGridEvent({ event_type: "scroll_depth", scroll_depth: depth, hero_product_id: heroProductId });
}
