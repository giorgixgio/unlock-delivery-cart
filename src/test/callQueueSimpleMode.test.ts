import { describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_SETTINGS, isQueueFinished, queueTier, sortQueue, type QueueOrderLike } from "@/lib/callQueuePolicy";

const now = new Date("2026-11-26T09:39:00Z");
const base: QueueOrderLike = { id: "old", status: "new", created_at: "2026-11-01T01:00:00Z" };

describe.each([false, true])("Simple Mode eligibility (catch-up %s)", catchUpEnabled => {
  const settings = { ...DEFAULT_QUEUE_SETTINGS, catchUpEnabled, catchUpGapMinutes: 120 };
  const tier = (patch: Partial<QueueOrderLike>) => queueTier({ ...base, ...patch }, "me", now, 120, settings);
  it("serves pre-November-23 fresh leads", () => expect(tier({})).toBe(2));
  it("does not hold night leads", () => expect(tier({ created_at: "2026-11-26T01:00:00Z" })).toBe(2));
  it("does not hold a future next-call time", () => expect(tier({ next_call_after: "2026-11-27T12:00:00Z" })).toBe(2));
  it("does not hold another operator's future callback", () => expect(tier({ call_outcome: "callback", queue_last_touched_by: "other", next_call_after: "2026-11-27T12:00:00Z" })).toBe(3));
  it("does not impose a retry gap", () => expect(tier({ call_attempt_count: 1, last_call_attempt_at: now.toISOString() })).toBe(4));
  it("keeps form grace until exactly 10 minutes", () => {
    expect(tier({ status: "pending_details", created_at: new Date(now.getTime() - 10 * 60000 + 1).toISOString() })).toBeNull();
    expect(tier({ status: "pending_details", created_at: new Date(now.getTime() - 10 * 60000).toISOString() })).toBe(2);
  });
  it.each([
    { is_return: true }, { auto_confirmed: true }, { is_confirmed: true }, { is_fulfilled: true }, { support_hold: true },
    { tags: ["test_sku"] }, { is_test_order: true }, { status: "merged" }, { status: "canceled" },
    { onway_sent_at: now.toISOString() }, { onway_api_status: "sent" }, { onway_api_status: "sending" },
    { tracking_number: "tracking" }, { onway_tracking: "tracking" }, { packed_at: now.toISOString() },
    { packing_wave_id: "wave" }, { merged_into_order_id: "parent" },
    { queue_locked_by: "other", queue_locked_until: "2026-11-26T10:00:00Z" },
  ])("keeps safety exclusion %j", patch => expect(tier(patch)).toBeNull());
  it("allows own locks case-insensitively", () => expect(tier({ queue_locked_by: "ME", queue_locked_until: "2026-11-26T10:00:00Z" })).toBe(2));
  it("serves all fresh leads ahead of retries and callbacks without time holds", () => {
    const rows: QueueOrderLike[] = [
      { ...base, id: "other", call_outcome: "callback", queue_last_touched_by: "other", next_call_after: "2026-11-27T12:00:00Z" },
      { ...base, id: "mine", call_outcome: "callback", queue_last_touched_by: "ME", next_call_after: "2026-11-28T12:00:00Z" },
      { ...base, id: "retry", call_attempt_count: 1, last_call_attempt_at: now.toISOString() },
      base, { ...base, id: "new", created_at: "2026-11-26T09:38:00Z" },
    ];
    expect(sortQueue(rows, "me", now, 3, settings).map(o => o.id)).toEqual(["new", "old", "retry", "mine", "other"]);
  });
});

describe("queue completion requires actual zero eligible orders", () => {
  it("finishes at zero", () => expect(isQueueFinished({ order_id: null, eligible_count: 0 })).toBe(true));
  it("does not finish when eligible rows were skipped under contention", () => expect(isQueueFinished({ order_id: null, eligible_count: 545 })).toBe(false));
  it("does not infer completion from a legacy empty response", () => expect(isQueueFinished({ order_id: null })).toBe(false));
  it("does not finish after a shift error", () => expect(isQueueFinished({ order_id: null, eligible_count: 0, error: "paused" })).toBe(false));
  it("does not finish with an assigned order", () => expect(isQueueFinished({ order_id: "order", eligible_count: 0 })).toBe(false));
});