import { describe, it, expect } from "vitest";
import { chunkIds, addChunk, emptyTotals, chunkBody, ONWAY_SEND_CHUNK } from "@/lib/onwayChunkSend";
import { renameBatchCount, pickTag, ONWAY_MAX_SEND_PER_REQUEST } from "../../supabase/functions/_shared/courierLabel";

describe("onway chunked send", () => {
  it("splits 300 ids into 12 chunks of 25, keeping order", () => {
    const ids = Array.from({ length: 300 }, (_, i) => `o${i}`);
    const c = chunkIds(ids);
    expect(c).toHaveLength(12);
    expect(c.every((x) => x.length === 25)).toBe(true);
    expect(c.flat()).toEqual(ids);
    expect(chunkIds(ids.slice(0, 51))).toHaveLength(3);
    expect(ONWAY_SEND_CHUNK).toBeLessThanOrEqual(ONWAY_MAX_SEND_PER_REQUEST);
    expect(ONWAY_MAX_SEND_PER_REQUEST).toBe(40);
  });
  it("first chunk's batch id is reused and totals are summed", () => {
    let t = addChunk(emptyTotals(), { fulfilled_count: 24, review_count: 1, sent_count: 24, batch_id: "b1", attempted_count: 25, failed_count: 1 }, 25);
    t = addChunk(t, { fulfilled_count: 25, review_count: 0, sent_count: 25, batch_id: "b1", attempted_count: 25, failed_count: 0 }, 25);
    expect(t).toMatchObject({ fulfilled_count: 49, review_count: 1, batch_id: "b1", done: 50, attempted: 50 });
    const body = chunkBody(["x"], { x: "S-0051", y: "S-0052" }, t, true);
    expect(body).toMatchObject({ batch_id: "b1", tags: { x: "S-0051" }, chunk: { final: true, prior: { attempted: 50, sent: 49, failed: 1 } } });
    expect(chunkBody(["x"], {}, emptyTotals(), false)).not.toHaveProperty("batch_id");
  });
  it("batch name keeps format with the final count", () => {
    expect(renameBatchCount("Onway API · 03 Nov 10:15 · 25 orders", 287)).toBe("Onway API · 03 Nov 10:15 · 287 orders");
  });
  it("uses the dry-run tag when present and valid", () => {
    expect(pickTag("a", "S-0001", { a: "S-0051" })).toBe("S-0051");
    expect(pickTag("a", "R01-01", { a: "R03-07" })).toBe("R03-07");
    expect(pickTag("a", "S-0001", { a: "junk" })).toBe("S-0001");
    expect(pickTag("a", "S-0001", null)).toBe("S-0001");
  });
});
