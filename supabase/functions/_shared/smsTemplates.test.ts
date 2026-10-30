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

// ---- Empty-placeholder protection ----
import { isTemplateIncomplete } from "./smsTemplates.ts";
const noNums = { ...v, num1: "", num2: "" };
Deno.test("lead_created without numbers uses the no-number variant", () => {
  const r = renderSms("lead_created", noNums);
  assertEquals(r.text, "Shekveta #122579 migebulia! Operatori male dagirekavt, gtxovt upasukhot. TRENDMART");
  assertEquals(r.skip, undefined);
});
Deno.test("lead_created with one number has no ' an '", () => {
  assertEquals(renderSms("lead_created", { ...v, num2: "" }).text,
    "Shekveta #122579 migebulia! Operatori male dagirekavt 555111222 nomridan. Gtxovt upasukhot. TRENDMART");
  assertEquals(renderSms("lead_created", { ...v, num1: "" }).text.includes(" an "), false);
});
Deno.test("call_no_answer, delivery_failed and address_problem skip without numbers", () => {
  for (const t of ["call_no_answer", "delivery_failed", "address_problem"] as const) assertEquals(renderSms(t, noNums).skip, "no_operator_numbers");
});
Deno.test("delivery_failed with one number", () => {
  assertEquals(renderSms("delivery_failed", { ...v, num2: "" }).text, "Kurierma ver dagikavshirdat. Dagvikavshirdit 555111222, rom shekveta xelaxla mogitanot. TRENDMART");
});
Deno.test("address_problem text", () => {
  assertEquals(renderSms("address_problem", v).text, "Misamarti ver vipovet. Dagvikavshirdit 555111222 an 555333444 misamartis dasazusteblad. TRENDMART");
});
Deno.test("order_auto_confirmed with and without product/number", () => {
  assertEquals(renderSms("order_auto_confirmed", { ...v, product: "Kamera" }).text,
    "Shekveta #122579 dadasturda! Kamera - 34 GEL, gadakhda kurierTan. Mitana: xval. Kitkhvebi? 555111222. TRENDMART");
  assertEquals(renderSms("order_auto_confirmed", noNums).text,
    "Shekveta #122579 dadasturda! Jami 34 GEL, gadakhda kurierTan. Mitana: xval. TRENDMART");
});
Deno.test("missing delivery date blocks the send", () => {
  assertEquals(renderSms("order_auto_confirmed", { ...v, when: undefined }).skip, "template_incomplete");
});
Deno.test("final check catches the broken live text", () => {
  assertEquals(isTemplateIncomplete("Operatori male dagirekavt  an  nomridan. TRENDMART"), true);
  assertEquals(isTemplateIncomplete("Hello {num1} TRENDMART"), true);
  assertEquals(isTemplateIncomplete("Shekveta # migebulia"), true);
  for (const t of ["lead_created", "call_no_answer", "order_confirmed", "out_for_delivery", "delivery_failed", "address_problem", "order_auto_confirmed"] as const)
    assertEquals(renderSms(t, { ...v, product: "Kamera" }).skip, undefined, t);
});
