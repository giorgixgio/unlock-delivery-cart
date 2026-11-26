import { describe, it, expect } from "vitest";
import { computeRetry, queueTier, sortQueue, DEFAULT_QUEUE_SETTINGS, type QueueOrderLike } from "@/lib/callQueuePolicy";

const now = new Date("2026-11-10T09:00:00Z");
const settings = { ...DEFAULT_QUEUE_SETTINGS, catchUpEnabled: true, catchUpGapMinutes: 15 };
const base: QueueOrderLike = { id: "x", status: "new", created_at: "2026-11-10T08:00:00Z" };
const me = "operator";
describe.each([false, true])("fresh-first ordering (catch-up %s)", (catchUpEnabled) => {
  const s = { ...settings, catchUpEnabled };
  const rows: QueueOrderLike[] = [
    { ...base, id: "freshOld", last_call_attempt_at: "2026-11-10T04:00:00Z" },
    { ...base, id: "freshNew", created_at: "2026-11-10T08:30:00Z", last_call_attempt_at: "2026-11-10T06:00:00Z" },
    { ...base, id: "many", call_attempt_count: 3, last_call_attempt_at: "2026-11-09T04:00:00Z" },
    { ...base, id: "recent", call_attempt_count: 1, last_call_attempt_at: "2026-11-10T06:00:00Z", next_call_after: "2026-11-10T07:00:00Z" },
    { ...base, id: "old", call_attempt_count: 1, last_call_attempt_at: "2026-11-09T05:00:00Z", next_call_after: "2026-11-10T08:00:00Z" },
    { ...base, id: "other", call_outcome: "callback", queue_last_touched_by: "other", next_call_after: "2026-11-10T07:00:00Z" },
    { ...base, id: "mineLater", call_outcome: "callback", queue_last_touched_by: me, next_call_after: "2026-11-10T08:50:00Z" },
    { ...base, id: "mineEarlier", call_outcome: "callback", queue_last_touched_by: me, next_call_after: "2026-11-10T08:30:00Z" },
  ];
  it("fresh sorts solely by newest creation, not last call", () => {
    expect(sortQueue(rows, me, now, 3, s).slice(0, 2).map(o => o.id)).toEqual(["freshNew", "freshOld"]);
  });
  it("retries use fewest attempts then oldest last call, not due time", () => {
    expect(sortQueue(rows.filter(o => (o.call_attempt_count ?? 0) > 0), me, now, 3, s).map(o => o.id)).toEqual(["old", "recent", "many"]);
  });
  it("callbacks wait until every eligible fresh and retry is gone", () => {
    expect(sortQueue(rows, me, now, 0, s).map(o => o.id)).toEqual(["freshNew", "freshOld", "old", "recent", "many", "mineEarlier", "mineLater", "other"]);
    expect(sortQueue(rows.filter(o => o.call_outcome === "callback"), me, now, 0, s).map(o => o.id)).toEqual(["mineEarlier", "mineLater", "other"]);
  });
  it("future callbacks and another active operator's callbacks are eligible", () => {
    const callbacks = rows.filter(o => o.call_outcome === "callback");
    callbacks.push({ ...base, id: "future", call_outcome: "callback", queue_last_touched_by: me, next_call_after: "2026-11-10T10:00:00Z" });
    callbacks.push({ ...base, id: "sticky", call_outcome: "callback", queue_last_touched_by: "other", next_call_after: "2026-11-10T08:55:00Z" });
    expect(sortQueue(callbacks, me, now, 0, s).map(o => o.id)).toEqual(["mineEarlier", "mineLater", "future", "other", "sticky"]);
  });
  it("all backlog and retry-turn settings leave fresh ahead of callbacks and retries", () => {
    for (const backlogMix of [2, 3] as const) for (const retryEveryN of [1, 4]) for (let picks = 0; picks < 8; picks++) {
      expect(sortQueue(rows, me, now, picks, { ...s, backlogMix, retryEveryN })[0].id).toBe("freshNew");
    }
  });
});
describe("temporary catch-up", () => {
  it("ignores future retry but preserves the 10-minute phone-only grace", () => {
    expect(queueTier({ ...base, next_call_after: "2026-11-11T10:00:00Z" }, me, now, 120, settings)).toBe(2);
    expect(queueTier({ ...base, status: "pending_details", created_at: "2026-11-10T08:59:00Z" }, me, now, 120, settings)).toBeNull();
  });
  it("ignores fresh night slots", () => {
    const nightNow = new Date("2026-11-10T01:00:00Z");
    expect(queueTier({ ...base, created_at: "2026-11-10T00:55:00Z" }, me, nightNow, 120, settings)).toBe(2);
  });
  it("never cancels at or beyond three attempts, including night", () => {
    for (const count of [3, 4, 20]) expect(computeRetry(count, now, now, settings)).toEqual({ action: "retry", at: new Date("2026-11-10T09:15:00Z") });
  });
  it("never imposes a retry gap, regardless of the retained scheduling setting", () => {
    const lead = { ...base, call_attempt_count: 4, last_call_attempt_at: "2026-11-10T08:50:00Z", next_call_after: "2026-11-09T10:00:00Z" };
    expect(queueTier(lead, me, now, 120, settings)).toBe(4);
    expect(queueTier(lead, me, now, 120, { ...settings, catchUpGapMinutes: 5 })).toBe(4);
    expect(queueTier(lead, me, new Date("2026-11-10T09:05:00Z"), 120, settings)).toBe(4);
  });
  it("future own callbacks remain eligible", () => {
    const callback = { ...base, call_outcome: "callback", next_call_after: "2026-11-10T10:00:00Z", queue_last_touched_by: me };
    expect(queueTier(callback, me, now, 120, settings)).toBe(1);
    expect(queueTier(callback, me, new Date("2026-11-10T10:00:00Z"), 120, settings)).toBe(1);
  });
  it("zero gap makes the just-attempted lead immediately callable without cancelling", () => {
    const zero = { ...settings, catchUpGapMinutes: 0 };
    const lead = { ...base, call_attempt_count: 4, last_call_attempt_at: now.toISOString(), next_call_after: "2026-11-11T06:00:00Z" };
    expect(computeRetry(4, now, now, zero)).toEqual({ action: "retry", at: now });
    expect(queueTier(lead, me, now, 120, zero)).toBe(4);
  });
  it("zero gap rotates a no-answer behind leads with fewer attempts or older calls", () => {
    const zero = { ...settings, catchUpGapMinutes: 0 };
    const rows = [
      { ...base, id: "justCalled", call_attempt_count: 3, last_call_attempt_at: now.toISOString() },
      { ...base, id: "olderCall", call_attempt_count: 3, last_call_attempt_at: "2026-11-10T08:59:00Z" },
      { ...base, id: "fewer", call_attempt_count: 2, last_call_attempt_at: "2026-11-10T08:59:30Z" },
      { ...base, id: "fresh", call_attempt_count: 0 },
    ];
    expect(sortQueue(rows, me, now, 0, zero).map(o => o.id)).toEqual(["fresh", "fewer", "olderCall", "justCalled"]);
  });
  it("selection never holds future callbacks or retries when catch-up is switched off", () => {
    const zero = { ...settings, catchUpGapMinutes: 0 };
    expect(queueTier({ ...base, call_outcome: "callback", next_call_after: "2026-11-10T10:00:00Z" }, me, now, 120, zero)).toBe(3);
    expect(queueTier({ ...base, call_attempt_count: 4, last_call_attempt_at: now.toISOString(), next_call_after: "2026-11-11T06:00:00Z" }, me, now, 120, { ...zero, catchUpEnabled: false })).toBe(4);
    expect(computeRetry(1, now, now, { ...zero, catchUpEnabled: false })).toEqual({ action: "retry", at: new Date("2026-11-10T11:00:00Z") });
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
  it("off preserves Simple Mode eligibility while outcome attempt rules stay unchanged", () => {
    const off = { ...settings, catchUpEnabled: false };
    expect(queueTier({ ...base, call_attempt_count: 5, next_call_after: "2026-11-11T06:00:00Z" }, me, now, 120, off)).toBe(4);
    expect(queueTier({ ...base, call_attempt_count: 5, next_call_after: "2026-11-10T08:00:00Z" }, me, now, 120, off)).toBe(4);
    expect(computeRetry(3, now, now, off)).toEqual({ action: "cancel" });
    expect(computeRetry(1, now, now, off)).toEqual({ action: "retry", at: new Date("2026-11-10T11:00:00Z") });
  });
});