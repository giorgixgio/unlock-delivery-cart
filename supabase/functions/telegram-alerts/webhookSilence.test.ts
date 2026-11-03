import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isWebhookSilent } from "../_shared/webhookSilence.ts";
import { isOwnerAlertEnabled } from "../_shared/telegramAlertPolicy.ts";
const at = (iso: string) => new Date(iso);
// 2026-11-03 is a Tuesday. 10:00 UTC = 14:00 Tbilisi.
Deno.test("webhook silent alerts are an allowed category", () => assertEquals(isOwnerAlertEnabled("webhook_silent"), true));
Deno.test("silent after more than 3h on a working day", () => assertEquals(isWebhookSilent(at("2026-11-03T10:00:00Z"), at("2026-11-03T06:59:00Z"), 5), true));
Deno.test("not silent at exactly under 3h", () => assertEquals(isWebhookSilent(at("2026-11-03T10:00:00Z"), at("2026-11-03T07:30:00Z"), 5), false));
Deno.test("no alert outside 10:00-20:00 Tbilisi", () => assertEquals(isWebhookSilent(at("2026-11-03T17:00:00Z"), at("2026-11-03T06:00:00Z"), 5), false));
Deno.test("no alert on Sunday", () => assertEquals(isWebhookSilent(at("2026-11-08T10:00:00Z"), at("2026-11-07T06:00:00Z"), 5), false));
Deno.test("no alert without open shipments", () => assertEquals(isWebhookSilent(at("2026-11-03T10:00:00Z"), at("2026-11-02T06:00:00Z"), 0), false));
