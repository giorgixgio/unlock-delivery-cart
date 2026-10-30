import { assertEquals } from "jsr:@std/assert@1";
import { actionForReason, commentHash, normalizeAiResult } from "./classify.ts";

Deno.test("low confidence or unknown reason becomes other", () => {
  assertEquals(normalizeAiResult({ reason: "refused", confidence: 0.59 }).reason, "other");
  assertEquals(normalizeAiResult({ reason: "banana", confidence: 0.9 }).reason, "other");
  assertEquals(normalizeAiResult(null).reason, "other");
  assertEquals(normalizeAiResult({ reason: "refused", confidence: 0.6, short_en_summary: "Refused" }), { reason: "refused", confidence: 0.6, summary: "Refused" });
});
Deno.test("reason actions", () => {
  for (const r of ["no_answer", "not_home", "wrong_phone"] as const) assertEquals(actionForReason(r), { sms: "delivery_failed", priority: false });
  for (const r of ["refused", "price_or_product_complaint"] as const) assertEquals(actionForReason(r), { sms: null, priority: true });
  assertEquals(actionForReason("wrong_address"), { sms: "address_problem", priority: false });
  assertEquals(actionForReason("reschedule"), { sms: null, priority: false });
  assertEquals(actionForReason("other"), { sms: null, priority: false });
});
Deno.test("identical comments share a cache hash", async () => {
  assertEquals(await commentHash(" არ პასუხობს "), await commentHash("არ პასუხობს"));
});
