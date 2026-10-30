import { assertEquals } from "jsr:@std/assert@1";
import { parseOnwayEvent } from "./process.ts";

const body = {
  order_info: { trackingnumber: "106139357", status: "აღების გაუქმება", order_status_id: "38", to_date: "02/11/2026", reason: 0 },
  history: [
    { status: "ასაღები", comment: "", date: "30.10.2026", hour: "12:46", timezone: "+04", order_status_id: "1", image: "" },
    { status: "აღების გაუქმება", comment: "გამგზავნი არ პასუხობს", date: "30.10.2026", hour: "12:53", timezone: "+04", order_status_id: "38", image: "system/uploadFiles/x.png" },
  ],
};

Deno.test("parses tracking, status, planned date and latest matching history entry", () => {
  const e = parseOnwayEvent(body)!;
  assertEquals([e.tracking, e.statusId, e.plannedDate, e.comment, e.reason], ["106139357", "38", "2026-11-02", "გამგზავნი არ პასუხობს", null]);
  assertEquals(e.image, "https://onway.ge/system/uploadFiles/x.png");
  assertEquals(e.eventTime, "2026-10-30T12:53:00+04:00");
});
Deno.test("same event re-sent gets the same dedupe key", () => {
  assertEquals(parseOnwayEvent(body)!.dedupeKey, parseOnwayEvent(structuredClone(body))!.dedupeKey);
});
Deno.test("payload without tracking is ignored", () => assertEquals(parseOnwayEvent({ order_info: { order_status_id: "1" } }), null));
