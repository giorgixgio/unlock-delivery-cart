import { assertEquals } from "jsr:@std/assert@1";
import { alreadySent, buildOnwayPayload, maskPayload, missingFields, parseTracking } from "./payload.ts";

const order = {
  id: "1", public_order_number: "1234", customer_name: "ნინო", customer_phone: "599111222",
  normalized_city: "", raw_city: "ბათუმი", normalized_address: "რუსთაველის 5", total: 39,
};

Deno.test("uses confirmed TrendMart sender and invoice/COD setup", () => {
  const p = buildOnwayPayload(order, "[S-0001] A1 - 1", { username: "u", key: "k" });
  assertEquals([p.from_name, p.from_phone, p.from_address, p.from_city],
    ["ტრენდმარტი", "555555555", "3 კახეთის გზატკეცილი", "თბილისი"]);
  assertEquals([p.payment, p.payer, p.receiver_shipprice_pay, p.brittle], [3, 3, 0, 0]);
  assertEquals(p.order_price, 39);
  assertEquals(p.to_city, "ბათუმი");
});

Deno.test("masks key", () => {
  const p = buildOnwayPayload(order, "", { username: "u", key: "secret" });
  assertEquals(maskPayload(p).key, "***");
});

Deno.test("flags missing fields", () => {
  const p = buildOnwayPayload({ ...order, customer_phone: "", total: 0 }, "", { username: "u", key: "k" });
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
