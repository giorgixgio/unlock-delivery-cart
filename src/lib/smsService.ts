// Centralized SMS helper. All fire-and-forget; nothing here throws to callers.
import { supabase } from "@/integrations/supabase/client";
import { trackEvent } from "@/lib/analytics";

export type SmsType = "confirmation" | "fulfillment";

export interface FulfillmentSmsTarget {
  orderId?: string;
  orderNumber: string;
  phone: string | null | undefined;
  status?: string | null;
}

export interface FulfillmentSmsSummary {
  attempted: number;
  sent: number;
  skipped: number;
  failed: number;
  skipReasons: Record<string, number>;
  errors: { orderNumber: string; code?: number | null; message?: string | null }[];
}

const SKIP_STATUSES = new Set(["canceled", "cancelled", "returned"]);

function hasValidGePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  let d = String(phone).replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("995")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d);
}

async function invokeSend(payload: { phone: string; orderNumber: string; type: SmsType }) {
  const { data, error } = await supabase.functions.invoke("send-sms", { body: payload });
  if (error) throw error;
  return data as { ok?: boolean; skipped?: string; status?: string; errorCode?: number | null; apiMessage?: string | null };
}

/** Fire-and-forget confirmation SMS. Never throws. */
export function sendConfirmationSms(orderNumber: string, phone: string | null | undefined) {
  if (!orderNumber || !hasValidGePhone(phone)) return;
  void invokeSend({ phone: phone as string, orderNumber, type: "confirmation" })
    .then((res) => {
      if (res?.ok) trackEvent("sms_sent", { orderNumber, type: "confirmation" });
      else if (res?.skipped) { /* already_sent or invalid_phone — silent */ }
      else trackEvent("sms_failed", { orderNumber, type: "confirmation", errorCode: res?.errorCode ?? null });
    })
    .catch((e) => {
      trackEvent("sms_failed", { orderNumber, type: "confirmation", errorCode: null, error: String((e as any)?.message || e) });
    });
}

/**
 * Central fulfillment SMS trigger. Batches with a small delay to protect the
 * gateway and returns a summary. Callers use it purely as a side-effect —
 * never awaited on the critical fulfillment path.
 */
export async function triggerFulfillmentSms(
  targets: FulfillmentSmsTarget[],
  opts: { batchSize?: number; delayMs?: number } = {},
): Promise<FulfillmentSmsSummary> {
  const batchSize = opts.batchSize ?? 5;
  const delayMs = opts.delayMs ?? 250;
  const summary: FulfillmentSmsSummary = {
    attempted: 0, sent: 0, skipped: 0, failed: 0, skipReasons: {}, errors: [],
  };

  const bumpSkip = (reason: string) => {
    summary.skipped++;
    summary.skipReasons[reason] = (summary.skipReasons[reason] || 0) + 1;
  };

  const eligible: FulfillmentSmsTarget[] = [];
  for (const t of targets) {
    if (!t.orderNumber) { bumpSkip("no_order_number"); continue; }
    if (t.status && SKIP_STATUSES.has(String(t.status).toLowerCase())) { bumpSkip("bad_status"); continue; }
    if (!hasValidGePhone(t.phone)) { bumpSkip("no_valid_phone"); continue; }
    eligible.push(t);
  }

  for (let i = 0; i < eligible.length; i += batchSize) {
    const batch = eligible.slice(i, i + batchSize);
    await Promise.all(batch.map(async (t) => {
      summary.attempted++;
      try {
        const res = await invokeSend({ phone: t.phone as string, orderNumber: t.orderNumber, type: "fulfillment" });
        if (res?.ok) {
          summary.sent++;
          trackEvent("sms_sent", { orderNumber: t.orderNumber, type: "fulfillment" });
        } else if (res?.skipped === "already_sent") {
          bumpSkip("already_sent");
        } else if (res?.skipped) {
          bumpSkip(res.skipped);
        } else {
          summary.failed++;
          summary.errors.push({ orderNumber: t.orderNumber, code: res?.errorCode ?? null, message: res?.apiMessage ?? null });
          trackEvent("sms_failed", { orderNumber: t.orderNumber, type: "fulfillment", errorCode: res?.errorCode ?? null });
        }
      } catch (e: any) {
        summary.failed++;
        summary.errors.push({ orderNumber: t.orderNumber, code: null, message: e?.message || String(e) });
        trackEvent("sms_failed", { orderNumber: t.orderNumber, type: "fulfillment", errorCode: null });
      }
    }));
    if (i + batchSize < eligible.length && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return summary;
}

/** Fetch current SMSOffice balance (admin-only). Returns null on error. */
export async function fetchSmsBalance(): Promise<number | null> {
  try {
    const { data, error } = await supabase.functions.invoke("sms-balance", { body: {} });
    if (error) return null;
    const b = (data as any)?.balance;
    return typeof b === "number" && Number.isFinite(b) ? b : null;
  } catch { return null; }
}

/** Estimate how many SMS a set of targets would consume (post-filter). */
export function countEligibleFulfillmentTargets(targets: FulfillmentSmsTarget[]): number {
  let n = 0;
  for (const t of targets) {
    if (!t.orderNumber) continue;
    if (t.status && SKIP_STATUSES.has(String(t.status).toLowerCase())) continue;
    if (!hasValidGePhone(t.phone)) continue;
    n++;
  }
  return n;
}
