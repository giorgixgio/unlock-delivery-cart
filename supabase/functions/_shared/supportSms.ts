// Pure rendering for support-ticket SMS (support_ack / support_followup / support_update).
// Texts come from support_ticket_settings; output is Latin GSM-7, one segment.
import { toGsm7 } from "./smsTemplates.ts";

export type SupportSmsType = "support_ack" | "support_followup" | "support_update";
export const SUPPORT_TYPES: SupportSmsType[] = ["support_ack", "support_followup", "support_update"];
export const isSupportType = (t: string): t is SupportSmsType => (SUPPORT_TYPES as string[]).includes(t);

export const DEFAULT_SUPPORT_TEXTS: Record<SupportSmsType, string> = {
  support_ack: "Tqveni mimartva mivighet. Specialisti dagikavshirdebat {days} samushao dgheshi. Detalebi: {link} {store}",
  support_followup: "Jer kidev vmushaobt tqvens mimartvaze. Shegidzliat daamatot detalebi: {link} {store}",
  support_update: "Tqveni mimartva ganakhlda. Nakhet: {link} {store}",
};

export interface SupportVars { link: string | null; store: string; days: number; n: string }

export function renderSupportSms(template: string, v: SupportVars): { text: string; segments: number; changed: boolean } {
  const raw = template
    .replaceAll("{link}", v.link ?? "")
    .replaceAll("{store}", v.store)
    .replaceAll("{days}", String(v.days))
    .replaceAll("{order}", v.n)
    .replace(/\s+/g, " ").trim();
  const { text, changed } = toGsm7(raw);
  return { text, segments: text.length <= 160 ? 1 : Math.ceil(text.length / 153), changed };
}
