import { isTestOrder } from "../_shared/testOrders.ts";
import { normalizeGePhone } from "../_shared/senderGe.ts";

export const CAMPAIGN = "lead_recovery_20261115";
export const WINDOW_END = "2026-11-15T12:02:00.000Z";
export const WINDOW_START = "2026-11-12T12:02:00.000Z";

export function eligible(o: any): boolean {
  return new Date(o.created_at).getTime() >= Date.parse(WINDOW_START)
    && new Date(o.created_at).getTime() <= Date.parse(WINDOW_END)
    && ["new", "pending_details", "pending_address"].includes(o.status)
    && Number(o.call_attempt_count || 0) === 0 && !o.last_call_attempt_at && !o.call_outcome
    && !o.support_hold && !o.is_confirmed && !o.auto_confirmed && !o.is_fulfilled
    && !o.is_return && !o.merged_into_order_id && !o.onway_sent_at && !o.onway_tracking
    && !o.tracking_number && !o.packed_at && !["packed", "packing"].includes(o.packing_status)
    && !isTestOrder(o) && !!normalizeGePhone(o.customer_phone)
    && /^[0-9A-Za-z]{6}$/.test(o.tracking_token || "") && o.order_items?.length > 0;
}

export function recoveryText(link: string): string {
  return `თქვენი შეკვეთა მიღებულია! ხვალ ოპერატორი დაგირეკავთ და გაგზავნას სწრაფად მოვამზადებთ. უფრო სწრაფი მიწოდებისთვის წინასწარ შეავსეთ მისამართი: ${link}. გადახდა კურიერთან მიღებისას.`;
}