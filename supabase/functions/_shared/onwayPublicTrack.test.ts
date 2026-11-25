import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { extractSessionCookie, parseOrderInfoPayload } from "./onwayPublicTrack.ts";

Deno.test("extractSessionCookie pulls OCSESSID from Set-Cookie", () => {
  assertEquals(
    extractSessionCookie("OCSESSID=77ec82ffc8225066763975bad9; path=/, language=ge-ka; path=/"),
    "OCSESSID=77ec82ffc8225066763975bad9",
  );
  assertEquals(extractSessionCookie("language=ge-ka; path=/"), null);
  assertEquals(extractSessionCookie(null), null);
});

Deno.test("parseOrderInfoPayload validates order_info.trackingnumber", () => {
  const ok = parseOrderInfoPayload(JSON.stringify({ total: 1, order_info: { trackingnumber: "106159966", status: "ჩაბარებული" }, history: [] }));
  assertEquals((ok as any)?.order_info?.status, "ჩაბარებული");
  assertEquals(parseOrderInfoPayload(""), null);
  assertEquals(parseOrderInfoPayload('{"error":"not found"}'), null);
  assertEquals(parseOrderInfoPayload('{"order_info":{}}'), null);
});