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

Deno.test("investigation SMS names store and order, asks for photo/video, promises no refund", () => {
  const t = refundText("https://trendmart.ge/refund/Ab3dEf7hij", "129802", 24, "TRENDMART");
  assertEquals(t.startsWith("TRENDMART: "), true);
  assertEquals(t.includes("#129802"), true);
  assertEquals(t.includes("განხილვა"), true);
  assertEquals(t.includes("ფოტო ან ვიდეო"), true);
  assertEquals(t.includes("https://trendmart.ge/refund/Ab3dEf7hij"), true);
  assertEquals(t.includes("24-72"), true);
  assertEquals(t.includes("IBAN"), false);
  assertEquals(t.includes("დაბრუნება"), false);
});
