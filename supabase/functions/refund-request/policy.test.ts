import { assertEquals } from "jsr:@std/assert@1";
import { normalizeIban } from "./policy.ts";
Deno.test("valid Georgian IBAN normalizes", () => assertEquals(normalizeIban("ge29 nb00 0000 0101 9049 17"), "GE29NB0000000101904917"));
Deno.test("bad checksum rejected", () => assertEquals(normalizeIban("GE28NB0000000101904917"), null));
Deno.test("non-Georgian rejected", () => assertEquals(normalizeIban("DE89370400440532013000"), null));
