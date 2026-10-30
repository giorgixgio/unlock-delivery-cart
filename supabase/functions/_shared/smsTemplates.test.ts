import { assertEquals } from "jsr:@std/assert@1";
import { applyQuietHours, deliveryWhen, isGsm7, renderSms, toGsm7 } from "./smsTemplates.ts";

// Tbilisi is UTC+4: "2026-10-30T17:00:00+04:00" is a Friday.
const at = (iso: string) => new Date(iso);

Deno.test("Fri 17:00 Tbilisi -> Saturday = xval", () => assertEquals(deliveryWhen(at("2026-10-30T17:00:00+04:00"), true), "xval"));
Deno.test("Fri 19:00 Tbilisi -> Monday", () => assertEquals(deliveryWhen(at("2026-10-30T19:00:00+04:00"), true), "orshabats"));
Deno.test("Sat 10:00 Tbilisi -> Monday", () => assertEquals(deliveryWhen(at("2026-10-31T10:00:00+04:00"), true), "orshabats"));
Deno.test("Sun before 18:00 -> Monday (tomorrow)", () => assertEquals(deliveryWhen(at("2026-11-01T12:00:00+04:00"), true), "xval"));
Deno.test("Sun after 18:00 -> Tuesday", () => assertEquals(deliveryWhen(at("2026-11-01T20:00:00+04:00"), true), "samshabats"));
Deno.test("Mon 19:00 -> Wednesday", () => assertEquals(deliveryWhen(at("2026-11-02T19:00:00+04:00"), true), "otkhshabats"));
Deno.test("Batumi -> 1-3 working days", () => assertEquals(deliveryWhen(at("2026-10-30T10:00:00+04:00"), false), "1-3 samushao dgeshi"));

Deno.test("quiet hours move 23:00 and 08:00 to 09:30 Tbilisi", () => {
  assertEquals(applyQuietHours(at("2026-10-30T23:00:00+04:00")).toISOString(), at("2026-10-31T09:30:00+04:00").toISOString());
  assertEquals(applyQuietHours(at("2026-10-31T08:00:00+04:00")).toISOString(), at("2026-10-31T09:30:00+04:00").toISOString());
  const day = at("2026-10-31T12:00:00+04:00");
  assertEquals(applyQuietHours(day).getTime(), day.getTime());
});

Deno.test("Georgian and lari sign are replaced with GSM-7 text", () => {
  const r = toGsm7("კამერა 19₾ “ok”");
  assertEquals(r.text, "kamera 19GEL \"ok\"");
  assertEquals(isGsm7(r.text), true);
});

const v = { n: "122579", store: "TRENDMART" as const, num1: "555111222", num2: "555333444", total: 34, when: "xval" };
Deno.test("every template fits one SMS with a 20-char product", () => {
  for (const t of ["lead_created", "call_no_answer", "order_confirmed", "out_for_delivery", "delivery_failed"] as const) {
    const r = renderSms(t, { ...v, product: "Mini WiFi kamera 2ts", when: "1-3 samushao dgeshi" });
    assertEquals(r.text.length <= 160 && isGsm7(r.text), true, t);
  }
});
Deno.test("product part is dropped when the text would exceed 160", () => {
  const r = renderSms("order_confirmed", { ...v, total: 1234.5, product: "X".repeat(60), when: "1-3 samushao dgeshi" });
  assertEquals(r.text.startsWith("Shekveta dadasturda! Jami 1234.50 GEL"), true);
});
Deno.test("confirmed text with product and integer total", () => {
  assertEquals(renderSms("order_confirmed", { ...v, product: "Kamera" }).text,
    "Shekveta dadasturda! Kamera - 34 GEL, gadakhda kurierTan. Mitana: xval. Madloba rom agvirchiet! TRENDMART");
});
