import { assertEquals } from "jsr:@std/assert@1";
import { extractLabelTracking, extractOrdersArray, maskOnwaySecrets, parseLabelRows } from "./onwayLabels.ts";

Deno.test("maskOnwaySecrets masks both username and key", () => {
  const masked = maskOnwaySecrets('{"user":"myuser","key":"secret123","ok":true}', "myuser", "secret123");
  assertEquals(masked, '{"user":"***","key":"***","ok":true}');
});

Deno.test("extractLabelTracking handles trackingnumber, traking, and parent_trackingnumber", () => {
  assertEquals(extractLabelTracking({ trackingnumber: "106239987" })?.tracking, "106239987");
  assertEquals(extractLabelTracking({ traking: 106239988 })?.tracking, "106239988");
  const child = extractLabelTracking({ trackingnumber: "106239987-2", parent_trackingnumber: "106239987" });
  assertEquals(child?.tracking, "106239987-2");
  assertEquals(child?.matchTrackings, ["106239987", "106239987-2"]);
  assertEquals(extractLabelTracking({ foo: "bar" }), null);
});

Deno.test("parseLabelRows assigns sequential box_index and box_count for duplicate tracking rows", () => {
  const rows = parseLabelRows([
    { trackingnumber: "106239987", to_name: "Nino" },
    { trackingnumber: "106239987", to_name: "Nino" },
  ]);
  assertEquals(rows.length, 2);
  assertEquals(rows[0].box_index, 1);
  assertEquals(rows[0].box_count, 2);
  assertEquals(rows[1].box_index, 2);
  assertEquals(rows[1].box_count, 2);
});

Deno.test("parseLabelRows parses explicit slash numbering and parent_trackingnumber groups", () => {
  const rows = parseLabelRows([
    { trackingnumber: "106240001", parent_trackingnumber: "106240000", box: "1/3" },
    { trackingnumber: "106240002", parent_trackingnumber: "106240000", box: "2/3" },
    { trackingnumber: "106240003", parent_trackingnumber: "106240000", box: "3/3" },
  ]);
  assertEquals(rows.map((r) => [r.tracking, r.box_index, r.box_count]), [
    ["106240001", 1, 3],
    ["106240002", 2, 3],
    ["106240003", 3, 3],
  ]);
  assertEquals(rows[0].matchTrackings[0], "106240000");
});

Deno.test("extractOrdersArray reads orders array safely", () => {
  assertEquals(extractOrdersArray({ orders: [{ a: 1 }] }).length, 1);
  assertEquals(extractOrdersArray({ orders: [] }).length, 0);
  assertEquals(extractOrdersArray([{ a: 1 }]).length, 1);
  assertEquals(extractOrdersArray({ error: "x" }).length, 0);
});