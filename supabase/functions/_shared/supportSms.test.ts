import { assert, assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_SUPPORT_TEXTS, renderSupportSms, SUPPORT_TYPES } from "./supportSms.ts";
import { isGsm7 } from "./smsTemplates.ts";

const v = { link: "https://trendmart.ge/t/Ab3x9K", store: "TRENDMART", days: 2, n: "125712" };

Deno.test("default support texts are one GSM-7 segment", () => {
  for (const t of SUPPORT_TYPES) {
    const r = renderSupportSms(DEFAULT_SUPPORT_TEXTS[t], v);
    assert(isGsm7(r.text), t);
    assertEquals(r.segments, 1, `${t}: ${r.text.length}`);
  }
});

Deno.test("ack text carries the promise days and link", () => {
  assertEquals(renderSupportSms(DEFAULT_SUPPORT_TEXTS.support_ack, v).text,
    "Tqveni mimartva mivighet. Specialisti dagikavshirdebat 2 samushao dgheshi. Detalebi: https://trendmart.ge/t/Ab3x9K TRENDMART");
});
