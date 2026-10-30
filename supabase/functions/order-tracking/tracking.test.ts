import { assertEquals } from "jsr:@std/assert@1";
import { buildStages, firstName, isHandedToCourier, plannedDateKa, streetOnly } from "./tracking.ts";

Deno.test("street only, no house or flat", () => {
  assertEquals(streetOnly("ვაჟა-ფშაველას გამზ. 12, ბ. 5"), "ვაჟა-ფშაველას გამზ");
  assertEquals(streetOnly("ჭავჭავაძის ქუჩა 33ა ბინა 4"), "ჭავჭავაძის ქუჩა");
  assertEquals(streetOnly("12 ვაჟა"), null);
  assertEquals(streetOnly(null), null);
});
Deno.test("first name only", () => assertEquals(firstName("ნინო ბერიძე"), "ნინო"));
Deno.test("handover detection", () => {
  assertEquals(isHandedToCourier({ status: "confirmed" }), false);
  assertEquals(isHandedToCourier({ status: "confirmed", onway_sent_at: "x" }), true);
  assertEquals(isHandedToCourier({ status: "shipped" }), true);
});
Deno.test("stages are real: nothing done beyond the data", () => {
  const s = buildStages({ created_at: "c", is_confirmed: true, status: "confirmed" }, { confirmedAt: "k", outForDeliveryAt: null, deliveredAt: null });
  assertEquals(s.map((x) => x.done), [true, true, false, false, false, false]);
  assertEquals(s[1].at, "k");
});
Deno.test("later stage implies earlier ones without inventing timestamps", () => {
  const s = buildStages({ created_at: "c", status: "shipped", onway_sent_at: "h" }, { confirmedAt: null, outForDeliveryAt: null, deliveredAt: null });
  assertEquals(s.map((x) => x.done), [true, true, true, true, false, false]);
  assertEquals(s[2].at, null);
});
Deno.test("planned date in Georgian", () => assertEquals(plannedDateKa("2026-11-02"), "ორშაბათი, 2 ნოემბერი"));
Deno.test("phone-as-name is never shown", () => assertEquals(firstName("555107727"), null));
