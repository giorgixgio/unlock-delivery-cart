import { assertEquals } from "jsr:@std/assert@1";
import { eligible } from "./policy.ts";
const lead = { created_at: "2026-11-14T12:00:00Z", status: "pending_details", call_attempt_count: 0, customer_phone: "555123456", tracking_token: "Ab12Cd", order_items: [{ sku: "real-product" }] };
Deno.test("only uncalled leads from the approved three-day window qualify", () => {
  assertEquals(eligible(lead), true);
  assertEquals(eligible({ ...lead, created_at: "2026-11-12T12:01:59Z" }), false);
  assertEquals(eligible({ ...lead, created_at: "2026-11-15T12:02:01Z" }), false);
  assertEquals(eligible({ ...lead, call_attempt_count: 1 }), false);
  assertEquals(eligible({ ...lead, last_call_attempt_at: "2026-11-14T13:00:00Z" }), false);
});
Deno.test("confirmed, cancelled, shipped, support and test orders receive no recovery SMS", () => {
  for (const status of ["confirmed", "canceled", "shipped", "on_hold"]) assertEquals(eligible({ ...lead, status }), false);
  assertEquals(eligible({ ...lead, support_hold: true }), false);
  assertEquals(eligible({ ...lead, order_items: [{ sku: "testtaro" }] }), false);
  assertEquals(eligible({ ...lead, tags: ["test_sku"] }), false);
  assertEquals(eligible({ ...lead, onway_sent_at: "2026-11-14T13:00:00Z" }), false);
});