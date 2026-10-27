import { supabase } from "@/integrations/supabase/client";
import { getCallSyncDeviceId, getCallSyncDeviceKind, toTelHref } from "@/lib/callSync";

export interface StartCallSyncInput {
  operatorId: string;
  orderId: string;
  phone: string;
  customerName?: string | null;
}

/**
 * Record an active call for the logged-in operator and return the tel: href.
 * The database write starts immediately but is never awaited by the caller,
 * so a slow network can never block dialing.
 */
export function startCallSync(input: StartCallSyncInput): { telHref: string; write: Promise<void> } {
  const write = (async () => {
    const { error } = await supabase.from("active_calls").insert({
      operator_id: input.operatorId,
      order_id: input.orderId,
      phone: input.phone,
      customer_name: input.customerName ?? null,
      source_device: getCallSyncDeviceKind(),
      device_id: getCallSyncDeviceId(),
    });
    if (error) console.warn("[call-sync] insert failed", error);
  })();

  return { telHref: toTelHref(input.phone), write };
}
