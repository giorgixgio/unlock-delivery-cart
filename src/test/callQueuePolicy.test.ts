import { describe, it, expect } from "vitest";
import { computeRetry, sortQueue, queueTier, type QueueOrderLike } from "@/lib/callQueuePolicy";

// Tbilisi = UTC+4
const tb = (s: string) => new Date(`${s}+04:00`);

describe("computeRetry", () => {
  it("1st no-answer at 11:00 → 13:00 same day", () => {
    const r = computeRetry(1, tb("2026-11-02T11:00:00"), tb("2026-11-02T11:00:00"));
    expect(r).toEqual({ action: "retry", at: tb("2026-11-02T13:00:00") });
  });
  it("1st no-answer at 20:00 → next day 11:00 (first call was afternoon)", () => {
    const r = computeRetry(1, tb("2026-11-02T20:00:00"), tb("2026-11-02T20:00:00"));
    expect(r).toEqual({ action: "retry", at: tb("2026-11-03T11:00:00") });
  });
  it("1st no-answer at 13:30 rolling past 21:00 with long gap → next day 15:00 (first call was morning)", () => {
    const r = computeRetry(1, tb("2026-11-02T13:30:00"), tb("2026-11-02T13:30:00"), { retryGapMinutes: 600, maxAttempts: 3, workStart: "10:00", workEnd: "21:00" });
    expect(r).toEqual({ action: "retry", at: tb("2026-11-03T15:00:00") });
  });
  it("2nd no-answer → next working day, opposite half from the 1st", () => {
    expect(computeRetry(2, tb("2026-11-02T11:00:00"), tb("2026-11-02T13:05:00")))
      .toEqual({ action: "retry", at: tb("2026-11-03T15:00:00") });
    expect(computeRetry(2, tb("2026-11-02T16:00:00"), tb("2026-11-02T18:10:00")))
      .toEqual({ action: "retry", at: tb("2026-11-03T11:00:00") });
  });
  it("3rd no-answer → cancel", () => {
    expect(computeRetry(3, tb("2026-11-02T11:00:00"), tb("2026-11-04T15:00:00"))).toEqual({ action: "cancel" });
  });
  it("manager override allows one more attempt", () => {
    expect(computeRetry(3, tb("2026-11-02T11:00:00"), tb("2026-11-04T15:00:00"), undefined, 1).action).toBe("retry");
  });
});

describe("queue priority", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  const base: QueueOrderLike = { id: "x", created_at: "2026-11-02T08:00:00Z", status: "new" };
  const me = "op@x.ge";
  it("orders: my callback, fresh oldest first, other callback, retries", () => {
    const orders: QueueOrderLike[] = [
      { ...base, id: "retry", call_attempt_count: 1, call_outcome: "no_answer", next_call_after: "2026-11-02T09:00:00Z" },
      { ...base, id: "otherCb", status: "on_hold", call_outcome: "callback", next_call_after: "2026-11-02T09:00:00Z", queue_last_touched_by: "b@x.ge" },
      { ...base, id: "freshNew", created_at: "2026-11-02T09:00:00Z" },
      { ...base, id: "freshOld", created_at: "2026-11-02T07:00:00Z" },
      { ...base, id: "myCb", status: "on_hold", call_outcome: "callback", next_call_after: "2026-11-02T09:55:00Z", queue_last_touched_by: me },
    ];
    expect(sortQueue(orders, me, now).map((o) => o.id)).toEqual(["myCb", "freshOld", "freshNew", "otherCb", "retry"]);
  });
  it("another operator's callback is sticky for 30 minutes", () => {
    const o = { ...base, status: "on_hold", call_outcome: "callback", next_call_after: "2026-11-02T09:45:00Z", queue_last_touched_by: "b@x.ge" };
    expect(queueTier(o, me, now)).toBeNull();
    expect(queueTier(o, "b@x.ge", now)).toBe(1);
  });
  it("excludes locked-by-others, future retries, confirmed and auto-confirmed", () => {
    expect(queueTier({ ...base, queue_locked_by: "b@x.ge", queue_locked_until: "2026-11-02T10:05:00Z" }, me, now)).toBeNull();
    expect(queueTier({ ...base, queue_locked_by: "b@x.ge", queue_locked_until: "2026-11-02T09:55:00Z" }, me, now)).toBe(2);
    expect(queueTier({ ...base, next_call_after: "2026-11-02T11:00:00Z" }, me, now)).toBeNull();
    expect(queueTier({ ...base, auto_confirmed: true }, me, now)).toBeNull();
    expect(queueTier({ ...base, is_confirmed: true }, me, now)).toBeNull();
  });
});

describe("night leads", () => {
  const tb2 = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00+04:00`);
  const base = { id: "n", status: "new", call_attempt_count: 0 };
  it("lead at 02:30 is not eligible at 10:15, eligible at 12:00", () => {
    const o = { ...base, created_at: tb2("2026-11-03", "02:30").toISOString() };
    expect(queueTier(o, "op", tb2("2026-11-03", "10:15"))).toBeNull();
    expect(queueTier(o, "op", tb2("2026-11-03", "12:00"))).toBe(2);
  });
  it("first no-answer at 12:30 retries at 18:00", () => {
    const r = computeRetry(1, tb2("2026-11-03", "12:30"), tb2("2026-11-03", "12:30"), undefined, 0, tb2("2026-11-03", "02:30"));
    expect(r).toEqual({ action: "retry", at: tb2("2026-11-03", "18:00") });
  });
  it("after 18:00 the normal rule applies", () => {
    const r = computeRetry(1, tb2("2026-11-03", "18:30"), tb2("2026-11-03", "18:30"), undefined, 0, tb2("2026-11-03", "02:30"));
    expect(r).toEqual({ action: "retry", at: tb2("2026-11-03", "20:30") });
  });
  it("lead at 22:00 is eligible at 10:00 next day", () => {
    const o = { ...base, created_at: tb2("2026-11-02", "22:00").toISOString() };
    expect(queueTier(o, "op", tb2("2026-11-03", "10:00"))).toBe(2);
  });
  it("lead at 08:00 is normal", () => {
    const o = { ...base, created_at: tb2("2026-11-03", "08:00").toISOString() };
    expect(queueTier(o, "op", tb2("2026-11-03", "10:00"))).toBe(2);
  });
});
