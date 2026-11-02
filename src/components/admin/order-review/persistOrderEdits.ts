import { supabase } from "@/integrations/supabase/client";
import { markAction } from "@/lib/operatorSession";

export function callNormalize(orderId: string) {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    fetch(`${url}/functions/v1/normalize-and-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (e) { console.warn("normalize call failed", e); }
}

/** Same writes as the quick-review pop-up: update, manual_edit event, markAction, normalize on address change. */
export async function persistOrderEdits(
  orderId: string, updates: Record<string, unknown>, actor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (Object.keys(updates).length === 0) return { ok: true };
  const { error } = await supabase.from("orders").update(updates as any).eq("id", orderId);
  if (error) return { ok: false, error: error.message };
  await supabase.from("order_events").insert({
    order_id: orderId, actor, event_type: "manual_edit",
    payload: { section: "quick_review", changed: Object.keys(updates) } as any,
  });
  markAction("manual_edit");
  if (updates.city !== undefined || updates.address_line1 !== undefined) callNormalize(orderId);
  return { ok: true };
}
