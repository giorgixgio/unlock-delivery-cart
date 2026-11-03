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

import { isQueueOnlyOperator, queueOnlyRedirect } from "@/lib/adminPermissions";
describe("master switch routing", () => {
  const on = { operators_use_queue: true, manager_emails: ["eto@bigmart.ge"] };
  it("plain operators are queue-only only when the switch is on", () => {
    expect(isQueueOnlyOperator("operator", "a@x.ge", on)).toBe(true);
    expect(isQueueOnlyOperator("operator", "a@x.ge", { ...on, operators_use_queue: false })).toBe(false);
  });
  it("managers and admins keep Orders", () => {
    expect(isQueueOnlyOperator("operator", "ETO@bigmart.ge", on)).toBe(false);
    expect(isQueueOnlyOperator("admin", "a@x.ge", on)).toBe(false);
  });
  it("orders list redirects, single order stays", () => {
    expect(queueOnlyRedirect("/admin/orders", true)).toBe("/admin/call-queue");
    expect(queueOnlyRedirect("/admin/orders/abc", true)).toBeNull();
    expect(queueOnlyRedirect("/admin/orders", false)).toBeNull();
  });
});

import { shiftGate, startShiftPlan, releasesLocks, autoEndAt } from "@/lib/callQueuePolicy";
describe("shift gate", () => {
  const T = (x: string) => new Date(`${x}+04:00`);
  const open = { started_at: T("2026-11-03T10:00:00").toISOString(), ended_at: null, paused: false };
  it("rejects without a shift and while paused", () => {
    expect(shiftGate(null)).toBe("not_on_shift");
    expect(shiftGate({ ...open, ended_at: "x" })).toBe("not_on_shift");
    expect(shiftGate({ ...open, paused: true })).toBe("paused");
    expect(shiftGate(open)).toBe("ok");
  });
  it("releases locks on pause and end only", () => {
    expect(releasesLocks(open, { ...open, paused: true })).toBe(true);
    expect(releasesLocks(open, { ...open, ended_at: "x" })).toBe(true);
    expect(releasesLocks({ ...open, paused: true }, open)).toBe(false);
  });
  it("single open shift: start resumes", () => {
    expect(startShiftPlan(open)).toBe("resume");
    expect(startShiftPlan(null)).toBe("insert");
  });
  it("sticky callback falls through when its operator is off shift", () => {
    const o = { id: "c", created_at: T("2026-11-03T09:00:00").toISOString(), status: "on_hold", call_outcome: "callback",
      call_attempt_count: 1, queue_last_touched_by: "a@x.ge", next_call_after: T("2026-11-03T11:00:00").toISOString() };
    const now = T("2026-11-03T11:05:00");
    expect(queueTier(o, "b@x.ge", now, 120, undefined, () => true)).toBeNull();
    expect(queueTier(o, "b@x.ge", now, 120, undefined, () => false)).toBe(3);
  });
  it("auto-end rules", () => {
    expect(autoEndAt(open, T("2026-11-03T11:00:00"), T("2026-11-03T11:30:00"))).toBeNull();
    expect(autoEndAt(open, T("2026-11-03T11:00:00"), T("2026-11-03T12:01:00"))?.toISOString()).toBe(T("2026-11-03T11:00:00").toISOString());
    expect(autoEndAt({ ...open, paused: true }, T("2026-11-03T11:00:00"), T("2026-11-03T13:00:00"))).toBeNull();
    expect(autoEndAt({ ...open, paused: true }, T("2026-11-03T20:30:00"), T("2026-11-03T22:05:00"))).not.toBeNull();
    expect(autoEndAt(open, T("2026-11-03T20:50:00"), T("2026-11-04T09:00:00"))).not.toBeNull();
  });
});

import { isOutsideWorkHours } from "@/lib/callQueuePolicy";
describe("late shift start (23:30 Tbilisi)", () => {
  const start = new Date("2026-11-02T19:30:00Z"); // 23:30 Tbilisi
  const open = { started_at: start.toISOString(), ended_at: null, paused: false };
  it("is on shift right after Start shift", () => {
    expect(autoEndAt(open, start, new Date(start.getTime() + 1000))).toBeNull();
    expect(shiftGate(open)).toBe("ok");
  });
  it("is never auto-ended within 60 minutes of start", () => {
    expect(autoEndAt(open, start, new Date(start.getTime() + 59 * 60000))).toBeNull();
  });
  it("day shift started before work_end+1h is still closed after the cutoff", () => {
    const day = { started_at: "2026-11-02T06:00:00Z", ended_at: null, paused: true };
    expect(autoEndAt(day, new Date("2026-11-02T17:50:00Z"), new Date("2026-11-02T18:10:00Z"))).not.toBeNull();
  });
  it("flags outside work hours", () => {
    expect(isOutsideWorkHours(start)).toBe(true);
    expect(isOutsideWorkHours(new Date("2026-11-02T08:00:00Z"))).toBe(false); // 12:00
  });
});

describe("phone-only leads (pending_details)", () => {
  const now = new Date("2026-11-03T08:00:00Z"); // 12:00 Tbilisi
  it("are served once 10 minutes old", () => {
    expect(queueTier({ id: "p", created_at: "2026-11-03T07:45:00Z", status: "pending_details" }, "a@x.ge", now)).toBe(2);
  });
  it("wait while the customer may still be typing the address", () => {
    expect(queueTier({ id: "p", created_at: "2026-11-03T07:55:00Z", status: "pending_details" }, "a@x.ge", now)).toBeNull();
  });
});
