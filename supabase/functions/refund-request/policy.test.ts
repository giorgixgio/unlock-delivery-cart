import { assertEquals } from "jsr:@std/assert@1";
import { normalizeIban, refundText, formatGel } from "./policy.ts";
Deno.test("valid Georgian IBAN normalizes", () => assertEquals(normalizeIban("ge29 nb00 0000 0101 9049 17"), "GE29NB0000000101904917"));
Deno.test("bad checksum rejected", () => assertEquals(normalizeIban("GE28NB0000000101904917"), null));
Deno.test("non-Georgian rejected", () => assertEquals(normalizeIban("DE89370400440532013000"), null));

Deno.test("money formats without needless cents", () => {
  assertEquals(formatGel(24), "24₾");
  assertEquals(formatGel(24.5), "24.50₾");
  assertEquals(formatGel(NaN), "0₾");
});

Deno.test("refund SMS names store, order, sum and asks only for the account number", () => {
  const t = refundText("https://trendmart.ge/refund/Ab3dEf7hij", "129802", 24, "TRENDMART");
  assertEquals(t.startsWith("TRENDMART: "), true);
  assertEquals(t.includes("#129802"), true);
  assertEquals(t.includes("24₾"), true);
  assertEquals(t.includes("ანგარიშის ნომერი"), true);
  assertEquals(t.includes("https://trendmart.ge/refund/Ab3dEf7hij"), true);
  assertEquals(t.includes("24-72"), true);
  // Never phrase it as a request for personal data — that reads like a scam text.
  assertEquals(t.includes("საბანკო მონაცემები"), false);
});
