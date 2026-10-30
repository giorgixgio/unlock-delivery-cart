import { assertEquals } from "jsr:@std/assert@1";
import { isRetryable, mapSendReply, normalizeGePhone } from "./senderGe.ts";

Deno.test("phone normalizes to 9 digits without 995", () => {
  assertEquals(normalizeGePhone("+995 555 12 34 56"), "555123456");
  assertEquals(normalizeGePhone("00995555123456"), "555123456");
  assertEquals(normalizeGePhone("0555123456"), "555123456");
  assertEquals(normalizeGePhone("322123456"), null);
});
Deno.test("200 maps to sent with message id and segments", () => {
  const r = mapSendReply({ httpStatus: 200, json: { data: [{ messageId: "abc", statusId: 1, qnt: 2 }] }, text: "" });
  assertEquals([r.status, r.messageId, r.segments], ["sent", "abc", 2]);
});
Deno.test("canceled subscription is skipped as unsubscribed", () => {
  const r = mapSendReply({ httpStatus: 403, json: { message: "sms subscription has been canceled" }, text: "" });
  assertEquals([r.status, r.apiMessage], ["skipped", "unsubscribed"]);
});
Deno.test("overdraft is failed with code and message", () => {
  const r = mapSendReply({ httpStatus: 402, json: { message: "overdraft" }, text: "" });
  assertEquals([r.status, r.httpStatus, r.apiMessage], ["failed", 402, "overdraft"]);
});
Deno.test("only 503 and network errors retry", () => {
  assertEquals(isRetryable({ httpStatus: 503, json: null, text: "" }), true);
  assertEquals(isRetryable({ httpStatus: null, json: null, text: "", networkError: "timeout" }), true);
  assertEquals(isRetryable({ httpStatus: 429, json: null, text: "" }), false);
  assertEquals(isRetryable({ httpStatus: 401, json: null, text: "" }), false);
});
