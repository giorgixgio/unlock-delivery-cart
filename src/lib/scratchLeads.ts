import { supabase } from "@/integrations/supabase/client";
import { cleanPhoneInput, isValidGeorgianMobile } from "@/lib/phoneValidation";
import { SCRATCH_GIFT_SKU, SCRATCH_PROMO, buildScratchGiftItems } from "@/lib/scratchGift";
import type { Product } from "@/lib/constants";

/** Scratch-card leads: phone captured in the popup (NOT an order). */
export const SCRATCH_TESTER_PHONE = "550501194";
export const SCRATCH_PHONE_KEY = "scratch_phone";
export const SCRATCH_LEAD_ID_KEY = "scratch_lead_id";
export const SCRATCH_TESTER_KEY = "scratch_tester";
export const SCRATCH_LEAD_WINDOW_MS = 24 * 3600_000;

/** Same normalization + validation the checkout uses. Returns 9 digits or null. */
export function normalizeScratchPhone(raw: string): string | null {
  const d = cleanPhoneInput(raw);
  return isValidGeorgianMobile(d) ? d : null;
}
export const isTesterPhone = (raw?: string | null) => cleanPhoneInput(raw || "") === SCRATCH_TESTER_PHONE;

/** Mirrors SQL scratch_lead_submit: skip when the phone has a lead or an order within 24h. */
export function shouldInsertScratchLead(recent: { created_at: string }[], now = Date.now()): boolean {
  return !recent.some((r) => now - new Date(r.created_at).getTime() < SCRATCH_LEAD_WINDOW_MS);
}

/** Mirrors trigger scratch_leads_link_order: open leads for the same phone get closed by a new order. */
export function leadMatchesOrder(lead: { phone: string; status: string; order_id: string | null }, orderPhone: string): boolean {
  return !lead.order_id && ["new", "called", "no_answer"].includes(lead.status) && lead.phone === cleanPhoneInput(orderPhone);
}
export const linkLeadToOrder = <L extends { status: string; order_id: string | null }>(lead: L, orderId: string): L => ({ ...lead, status: "ordered", order_id: orderId });

/** Tester mode: popup always shows and ignores revealed/activated flags. */
export function shouldShowScratchPopup(st: { revealed: boolean; active: boolean }, tester: boolean): boolean {
  return tester || (!st.revealed && !st.active);
}
/** Meta pixel events are never fired for the owner's test number. */
export const metaAllowedForPhone = (phone?: string | null) => !isTesterPhone(phone);

/** One-tap order: saved phone + chosen qty + gift line. */
export function buildOneTapOrder(product: Product, qty: number, phone: string, subtotal: number, landingSlug: string) {
  const items = buildScratchGiftItems(product, qty, true);
  return {
    customerName: phone, customerPhone: phone, items, subtotal, total: subtotal + 5, shippingFee: 5,
    source: "landing_cod", landingSlug, status: "pending_details",
    promo: items.some((i) => i.isGift) ? SCRATCH_PROMO : undefined,
  };
}

const safe = <T,>(fn: () => T, fb: T): T => { try { return fn(); } catch { return fb; } };
export const readSavedScratchPhone = () => safe(() => normalizeScratchPhone(localStorage.getItem(SCRATCH_PHONE_KEY) || ""), null);
export const saveScratchPhone = (p: string) => safe(() => localStorage.setItem(SCRATCH_PHONE_KEY, p), undefined);
export const readScratchLeadId = () => safe(() => localStorage.getItem(SCRATCH_LEAD_ID_KEY), null);
export const clearScratchLeadId = () => safe(() => localStorage.removeItem(SCRATCH_LEAD_ID_KEY), undefined);
export const isScratchTester = () => safe(() => localStorage.getItem(SCRATCH_TESTER_KEY) === "1", false);
export const setScratchTester = (on: boolean) => safe(() => on ? localStorage.setItem(SCRATCH_TESTER_KEY, "1") : localStorage.removeItem(SCRATCH_TESTER_KEY), undefined);
/** Mark the device as tester when the owner's number is typed anywhere. */
export const noteTesterPhone = (phone: string) => { if (isTesterPhone(phone)) setScratchTester(true); };

/** `?scratch_test=1` turns tester mode on, `=0` off. Returns whether the URL forces the popup. */
export function applyScratchTestParam(search: string): boolean {
  const v = new URLSearchParams(search).get("scratch_test");
  if (v === "1") { setScratchTester(true); return true; }
  if (v === "0") setScratchTester(false);
  return false;
}

/** Custom Meta event for the popup phone — never Lead/Purchase. */
export function trackScratchLead(phone: string) {
  if (!metaAllowedForPhone(phone) || isScratchTester()) return false;
  window.fbq?.("trackCustom", "ScratchLead", { content_ids: [SCRATCH_GIFT_SKU], promo: SCRATCH_PROMO });
  return true;
}

export async function submitScratchLead(phone: string, landingSlug: string): Promise<string | null> {
  saveScratchPhone(phone);
  noteTesterPhone(phone);
  trackScratchLead(phone);
  try {
    const { data } = await (supabase as any).rpc("scratch_lead_submit", { p_phone: phone, p_sku: SCRATCH_GIFT_SKU, p_landing_slug: landingSlug, p_is_test: isTesterPhone(phone) });
    if (data) safe(() => localStorage.setItem(SCRATCH_LEAD_ID_KEY, String(data)), undefined);
    return data ?? null;
  } catch { return null; }
}

/** After an order: link the stored lead (phone match is also done by a DB trigger). */
export async function linkScratchLead(orderId: string) {
  const id = readScratchLeadId(); if (!id) return;
  try { await (supabase as any).rpc("scratch_lead_link", { p_lead_id: id, p_order_id: orderId }); clearScratchLeadId(); } catch { /* trigger fallback */ }
}
