import { normalizePhone } from "@/lib/phoneUtils";

/** Only react to call-sync records created within this window. */
export const CALL_SYNC_MAX_AGE_MS = 30_000;

const DEVICE_ID_KEY = "call_sync_device_id";

/** Stable per-device id (localStorage) so a device never reacts to its own records. */
export function getCallSyncDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "unknown";
  }
}

/** 'phone' for touch/mobile devices, 'pc' otherwise. */
export function getCallSyncDeviceKind(): "phone" | "pc" {
  if (typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
    return "phone";
  }
  if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) {
    return "phone";
  }
  return "pc";
}

/** Build a tel: href, normalizing Georgian numbers to +995 format. */
export function toTelHref(raw: string): string {
  const digits = normalizePhone(raw);
  if (/^\d{9,15}$/.test(digits)) return `tel:+${digits}`;
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
}

export interface ActiveCallRecord {
  id: string;
  operator_id: string;
  order_id: string;
  phone: string;
  customer_name: string | null;
  source_device: string;
  device_id: string;
  created_at: string;
}

/** True when this device should react to an incoming active-call record. */
export function shouldReactToCall(
  record: Pick<ActiveCallRecord, "device_id" | "created_at">,
  ownDeviceId: string,
  now: number = Date.now(),
): boolean {
  if (record.device_id === ownDeviceId) return false;
  const age = now - new Date(record.created_at).getTime();
  return age >= 0 && age <= CALL_SYNC_MAX_AGE_MS;
}
