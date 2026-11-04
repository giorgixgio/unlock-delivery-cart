import { supabase } from "@/integrations/supabase/client";
import type { ConfirmBlockedReason } from "@/lib/queueSearchRules";

/**
 * Fire-and-forget order_event insert that actually executes (query builders are lazy —
 * an un-awaited `.insert()` is never sent) and never throws.
 */
export async function logOrderEventSafe(orderId: string, actor: string, eventType: string, payload: Record<string, unknown> = {}): Promise<void> {
  try {
    const { error } = await supabase.from("order_events").insert({ order_id: orderId, actor, event_type: eventType, payload: payload as any });
    if (error) console.warn(`[order_events] ${eventType} insert failed`, error.message);
  } catch (e) {
    console.warn(`[order_events] ${eventType} insert threw`, e);
  }
}

export function logConfirmBlocked(orderId: string, actor: string, p: {
  reason: ConfirmBlockedReason; missing_fields?: string[]; error_message?: string | null; source: string;
}): Promise<void> {
  return logOrderEventSafe(orderId, actor, "confirm_blocked", {
    reason: p.reason, missing_fields: p.missing_fields ?? [], error_message: p.error_message ?? null, source: p.source,
  });
}
