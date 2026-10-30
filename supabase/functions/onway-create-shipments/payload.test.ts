import { assertEquals } from "jsr:@std/assert@1";
import { validPickupPhone, alreadySent, buildOnwayPayload, maskPayload, missingFields, parseTracking } from "./payload.ts";

const order = {
  id: "1", public_order_number: "1234", customer_name: "ნინო", customer_phone: "599111222",
  normalized_city: "", raw_city: "ბათუმი", normalized_address: "რუსთაველის 5", total: 39,
};

Deno.test("uses confirmed TrendMart sender and invoice/COD setup", () => {
  const p = buildOnwayPayload(order, "[S-0001] A1 - 1", { username: "u", key: "k" }, "599000111");
  assertEquals([p.from_name, p.from_phone, p.from_address, p.from_city],
    ["ტრენდმარტი", "599000111", "3 კახეთის გზატკეცილი", "თბილისი"]);
  assertEquals([p.payment, p.payer, p.receiver_shipprice_pay, p.brittle], [3, 3, 0, 0]);
  assertEquals(p.order_price, 39);
  assertEquals(p.to_city, "ბათუმი");
});

Deno.test("masks key", () => {
  const p = buildOnwayPayload(order, "", { username: "u", key: "secret" }, "599000111");
  assertEquals(maskPayload(p).key, "***");
});

Deno.test("flags missing fields", () => {
  const p = buildOnwayPayload({ ...order, customer_phone: "", total: 0 }, "", { username: "u", key: "k" }, "599000111");
  assertEquals(missingFields(p), ["to_phone", "order_price"]);
});

Deno.test("skips sent or tracked orders", () => {
  assertEquals(alreadySent({ onway_sent_at: "2026-01-01" }), true);
  assertEquals(alreadySent({ onway_tracking: "X1" }), true);
  assertEquals(alreadySent({}), false);
});

Deno.test("parses only clearly named tracking", () => {
  assertEquals(parseTracking('{"data":{"tracking_number":"ON123"}}'), "ON123");
  assertEquals(parseTracking('{"order_id":55}'), null);
  assertEquals(parseTracking("ok"), null);
});

Deno.test("pickup phone rejects empty and the 555555555 placeholder", () => {
  assertEquals(validPickupPhone(""), null);
  assertEquals(validPickupPhone("555555555"), null);
  assertEquals(validPickupPhone("+995 599 00 01 11"), "599000111");
});
