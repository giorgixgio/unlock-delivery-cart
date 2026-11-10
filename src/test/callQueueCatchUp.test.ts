import { describe, it, expect } from "vitest";
import { computeRetry, queueTier, sortQueue, DEFAULT_QUEUE_SETTINGS, type QueueOrderLike } from "@/lib/callQueuePolicy";

const now = new Date("2026-11-10T09:00:00Z");
const settings = { ...DEFAULT_QUEUE_SETTINGS, catchUpEnabled: true, catchUpGapMinutes: 15 };
const base: QueueOrderLike = { id: "x", status: "new", created_at: "2026-11-10T08:00:00Z" };
const me = "operator";
describe("temporary catch-up", () => {
  it("ignores future retry and fresh phone-only grace", () => {
    expect(queueTier({ ...base, next_call_after: "2026-11-11T10:00:00Z" }, me, now, 120, settings)).toBe(2);
    expect(queueTier({ ...base, status: "pending_details", created_at: "2026-11-10T08:59:00Z" }, me, now, 120, settings)).toBe(2);
  });
  it("ignores fresh night slots", () => {
    const nightNow = new Date("2026-11-10T01:00:00Z");
    expect(queueTier({ ...base, created_at: "2026-11-10T00:55:00Z" }, me, nightNow, 120, settings)).toBe(2);
  });
  it("never cancels at or beyond three attempts, including night", () => {
    for (const count of [3, 4, 20]) expect(computeRetry(count, now, now, settings)).toEqual({ action: "retry", at: new Date("2026-11-10T09:15:00Z") });
  });
  it("enforces 15 minutes even with an old due time; accepts a lower setting", () => {
    const lead = { ...base, call_attempt_count: 4, last_call_attempt_at: "2026-11-10T08:50:00Z", next_call_after: "2026-11-09T10:00:00Z" };
    expect(queueTier(lead, me, now, 120, settings)).toBeNull();
    expect(queueTier(lead, me, now, 120, { ...settings, catchUpGapMinutes: 5 })).toBe(4);
    expect(queueTier(lead, me, new Date("2026-11-10T09:05:00Z"), 120, settings)).toBe(4);
  });
  it("keeps requested callback time and sticky owner", () => {
    const callback = { ...base, call_outcome: "callback", next_call_after: "2026-11-10T10:00:00Z", queue_last_touched_by: me };
    expect(queueTier(callback, me, now, 120, settings)).toBeNull();
    expect(queueTier(callback, me, new Date("2026-11-10T10:00:00Z"), 120, settings)).toBe(1);
  });
  it("sorts never-called first then fewest attempts, oldest last-call, newest creation", () => {
    const rows = [
      { ...base, id: "many", call_attempt_count: 4, last_call_attempt_at: "2026-11-09T01:00:00Z" },
      { ...base, id: "recent", call_attempt_count: 1, last_call_attempt_at: "2026-11-10T08:30:00Z" },
      { ...base, id: "old", call_attempt_count: 1, last_call_attempt_at: "2026-11-10T08:00:00Z" },
      { ...base, id: "oldNewer", created_at: "2026-11-10T08:10:00Z", call_attempt_count: 1, last_call_attempt_at: "2026-11-10T08:00:00Z" },
      { ...base, id: "freshOld" }, { ...base, id: "freshNew", created_at: "2026-11-10T08:59:00Z" },
    ];
    expect(sortQueue(rows, me, now, 0, settings).map(o => o.id)).toEqual(["freshNew", "freshOld", "oldNewer", "old", "recent", "many"]);
  });
  it("preserves test, support, confirmed, cancelled and lock exclusions", () => {
    for (const patch of [{ tags: ["test_sku"] }, { support_hold: true }, { is_confirmed: true }, { status: "canceled" }, { onway_api_status: "sent" }, { merged_into_order_id: "converted" }, { queue_locked_by: "other", queue_locked_until: "2026-11-10T10:00:00Z" }]) {
      expect(queueTier({ ...base, ...patch }, me, now, 120, settings)).toBeNull();
    }
  });
  it("off immediately restores normal eligibility and attempt rules without cancelling by selection", () => {
    const off = { ...settings, catchUpEnabled: false };
    expect(queueTier({ ...base, call_attempt_count: 5, next_call_after: "2026-11-11T06:00:00Z" }, me, now, 120, off)).toBeNull();
    expect(queueTier({ ...base, call_attempt_count: 5, next_call_after: "2026-11-10T08:00:00Z" }, me, now, 120, off)).toBe(4);
    expect(computeRetry(3, now, now, off)).toEqual({ action: "cancel" });
    expect(computeRetry(1, now, now, off)).toEqual({ action: "retry", at: new Date("2026-11-10T11:00:00Z") });
  });
});