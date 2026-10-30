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
  const r = renderSms("order_confirmed", { ...v, total: 1234.5, product: "X".repeat(110), when: "1-3 samushao dgeshi" });
  assertEquals(r.text.startsWith("Shekveta dadasturda! Jami 1234.50 GEL"), true);
});
Deno.test("confirmed text with product and integer total", () => {
  assertEquals(renderSms("order_confirmed", { ...v, product: "Kamera" }).text,
    "Shekveta dadasturda! Kamera - 34 GEL, gadakhda kurierTan. Mitana: xval. TRENDMART");
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
Deno.test("no-number fallbacks still send", () => {
  assertEquals(renderSms("call_no_answer", noNums).text, "Shekvetis dasadastureblad dagirekeT, magram ver dagikavshirdit. Gtxovt upasukhot shemdeg zars an gadmogvirekt gamotovebul nomerze. TRENDMART");
  assertEquals(renderSms("delivery_failed", noNums).text, "Kurierma ver dagikavshirdat. Gtxovt upasukhot shemdeg zars an gadmogvirekt, rom shekveta xelaxla mogitanot. TRENDMART");
  assertEquals(renderSms("address_problem", noNums).text, "Misamarti ver vipovet. Gtxovt upasukhot chvens zars misamartis dasazusteblad. TRENDMART");
  for (const t of ["call_no_answer", "delivery_failed", "address_problem"] as const) assertEquals(renderSms(t, noNums).skip, undefined);
});
Deno.test("delivery_failed with one number", () => {
  assertEquals(renderSms("delivery_failed", { ...v, num2: "" }).text, "Kurierma ver dagikavshirdat. Dagvikavshirdit 555111222, rom shekveta xelaxla mogitanot. TRENDMART");
});
Deno.test("address_problem text", () => {
  assertEquals(renderSms("address_problem", v).text, "Misamarti ver vipovet. Dagvikavshirdit 555111222 an 555333444 misamartis dasazusteblad. TRENDMART");
});
Deno.test("order_auto_confirmed with and without product/number", () => {
  assertEquals(renderSms("order_auto_confirmed", { ...v, product: "Kamera" }).text,
    "Shekveta #122579 dadasturda! Kamera - 34 GEL, gadakhda kurierTan. Mitana: xval. TRENDMART");
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

// ---- Tracking link ----
import { deliveryWhenKa, trackingLink } from "./smsTemplates.ts";
const worst = { n: "123456", store: "TRENDMART" as const, num1: "555111222", num2: "555333444", total: 1234.5, when: "otkhshabats", product: "X".repeat(20), link: "trendmart.ge/t/Ab3x9K" };
Deno.test("link goes on lead/confirmed/out-for-delivery and fits one SMS in the worst case", () => {
  for (const t of ["lead_created", "order_auto_confirmed", "order_confirmed", "out_for_delivery"] as const) {
    const r = renderSms(t, worst);
    assertEquals(r.skip, undefined, t);
    assertEquals(r.text.endsWith(" Tvali adevnet: trendmart.ge/t/Ab3x9K TRENDMART"), true, t);
    assertEquals(r.text.length <= 160, true, `${t} ${r.text.length}`);
  }
  assertEquals(renderSms("lead_created", { ...worst, num1: "", num2: "" }).text,
    "Shekveta #123456 migebulia! Operatori male dagirekavt, gtxovt upasukhot. Tvali adevnet: trendmart.ge/t/Ab3x9K TRENDMART");
});
Deno.test("no link on call-us texts", () => {
  for (const t of ["call_no_answer", "delivery_failed", "address_problem"] as const) assertEquals(renderSms(t, worst).text.includes("/t/"), false, t);
});
Deno.test("drop order: product first, then link, never two segments", () => {
  const long = { ...worst, product: "X".repeat(60) };
  const r = renderSms("order_confirmed", long);
  assertEquals(r.warnings.includes("product_dropped"), true);
  const r2 = renderSms("lead_created", { ...worst, n: "1".repeat(50) });
  assertEquals(r2.warnings.includes("link_dropped"), true);
  assertEquals(r2.text.includes("/t/"), false);
  assertEquals(r2.text.length <= 160, true);
});
Deno.test("domain follows the store", () => {
  assertEquals(trackingLink("BIGMART", "Ab3x9K"), "bigmart.ge/t/Ab3x9K");
  assertEquals(trackingLink("TRENDMART", null), null);
});
Deno.test("Georgian delivery day uses the same rule", () => {
  assertEquals(deliveryWhenKa(new Date("2026-10-29T10:00:00Z"), true), "ხვალ"); // Thu 14:00 -> Fri
  assertEquals(deliveryWhenKa(new Date("2026-10-31T15:00:00Z"), true), "სამშაბათს"); // Sat 19:00 -> 2 working days, Sunday off
  assertEquals(deliveryWhenKa(new Date(), false), "1-3 სამუშაო დღეში");
});
