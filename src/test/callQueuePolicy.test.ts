import { describe, it, expect } from "vitest";
import { computeRetry, sortQueue, queueTier, isRetryTurn, type QueueOrderLike } from "@/lib/callQueuePolicy";

// Tbilisi = UTC+4
const tb = (s: string) => new Date(`${s}+04:00`);

describe("computeRetry", () => {
  it("1st no-answer at 11:00 → 13:00 same day", () => {
    const r = computeRetry(1, tb("2026-11-02T11:00:00"), tb("2026-11-02T11:00:00"));
    expect(r).toEqual({ action: "retry", at: tb("2026-11-02T13:00:00") });
  });
  it("1st no-answer at 20:00 → next day 10:00 (work_start)", () => {
    const r = computeRetry(1, tb("2026-11-02T20:00:00"), tb("2026-11-02T20:00:00"));
    expect(r).toEqual({ action: "retry", at: tb("2026-11-03T10:00:00") });
  });
  it("1st no-answer rolling past 21:00 with long gap → next day 10:00", () => {
    const r = computeRetry(1, tb("2026-11-02T13:30:00"), tb("2026-11-02T13:30:00"), { retryGapMinutes: 600, maxAttempts: 3, workStart: "10:00", workEnd: "21:00" });
    expect(r).toEqual({ action: "retry", at: tb("2026-11-03T10:00:00") });
  });
  it("2nd no-answer (final attempt) → next day 10:00", () => {
    expect(computeRetry(2, tb("2026-11-02T11:00:00"), tb("2026-11-02T13:05:00")))
      .toEqual({ action: "retry", at: tb("2026-11-03T10:00:00") });
    expect(computeRetry(2, tb("2026-11-02T16:00:00"), tb("2026-11-02T18:10:00")))
      .toEqual({ action: "retry", at: tb("2026-11-03T10:00:00") });
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
  it("orders: my callback, other callback, then fresh newest first, then retries", () => {
    // 14:00 Tbilisi, nothing older than 3 h
    const orders: QueueOrderLike[] = [
      { ...base, id: "retry", call_attempt_count: 1, call_outcome: "no_answer", last_call_attempt_at: "2026-11-02T07:00:00Z", next_call_after: "2026-11-02T09:00:00Z" },
      { ...base, id: "otherCb", status: "on_hold", call_outcome: "callback", next_call_after: "2026-11-02T09:00:00Z", queue_last_touched_by: "b@x.ge" },
      { ...base, id: "freshNew", created_at: "2026-11-02T09:00:00Z" },
      { ...base, id: "freshOld", created_at: "2026-11-02T08:00:00Z" },
      { ...base, id: "myCb", status: "on_hold", call_outcome: "callback", next_call_after: "2026-11-02T09:55:00Z", queue_last_touched_by: me },
    ];
    expect(sortQueue(orders, me, now).map((o) => o.id)).toEqual(["myCb", "otherCb", "freshNew", "freshOld", "retry"]);
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
  it("orders list and single orders stay reachable (view-only); admin home goes to the queue", () => {
    expect(queueOnlyRedirect("/admin/orders", true)).toBeNull();
    expect(queueOnlyRedirect("/admin/orders/abc", true)).toBeNull();
    expect(queueOnlyRedirect("/admin", true)).toBe("/admin/call-queue");
    expect(queueOnlyRedirect("/admin", false)).toBeNull();
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

describe("ordering v2", () => {
  const T = (x: string) => new Date(`${x}+04:00`);
  const me = "op@x.ge";
  const fresh = (id: string, at: string): QueueOrderLike => ({ id, status: "new", created_at: T(at).toISOString() });
  const retry = (id: string, lastAt: string, dueAt: string): QueueOrderLike => ({
    id, status: "new", created_at: T("2026-11-01T12:00:00").toISOString(), call_attempt_count: 1, call_outcome: "no_answer",
    last_call_attempt_at: T(lastAt).toISOString(), next_call_after: T(dueAt).toISOString() });

  it("morning block: callback, carried-over retries oldest first, off-hours fresh newest, then the rest", () => {
    const now = T("2026-11-04T10:30:00");
    const cb: QueueOrderLike = { id: "cb", status: "on_hold", created_at: T("2026-11-03T12:00:00").toISOString(), call_outcome: "callback",
      next_call_after: T("2026-11-04T10:00:00").toISOString(), queue_last_touched_by: me };
    const list = [
      fresh("dayFresh", "2026-11-04T10:20:00"),
      fresh("eve21", "2026-11-03T21:30:00"),
      fresh("eve23", "2026-11-03T23:10:00"),
      retry("rNew", "2026-11-03T19:00:00", "2026-11-04T10:00:00"),
      retry("rOld", "2026-11-02T15:00:00", "2026-11-03T11:00:00"),
      cb,
    ];
    expect(sortQueue(list, me, now).map((o) => o.id)).toEqual(["cb", "rOld", "rNew", "eve21", "eve23", "dayFresh"]);
    expect(sortQueue(list, me, now, 1).map((o) => o.id)).toEqual(["cb", "rOld", "rNew", "dayFresh", "eve23", "eve21"]);
  });

  it("afternoon: fresh newest first", () => {
    const now = T("2026-11-04T15:00:00");
    const list = [fresh("a", "2026-11-04T13:00:00"), fresh("b", "2026-11-04T14:30:00"), fresh("c", "2026-11-04T14:00:00")];
    expect(sortQueue(list, me, now).map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("every 4th hand-out is a due retry if one exists", () => {
    const now = T("2026-11-04T15:00:00");
    const list = [fresh("f", "2026-11-04T14:50:00"), retry("r", "2026-11-04T12:00:00", "2026-11-04T14:00:00")];
    expect(sortQueue(list, me, now, 0)[0].id).toBe("f");
    expect(sortQueue(list, me, now, 2)[0].id).toBe("f");
    expect(sortQueue(list, me, now, 3)[0].id).toBe("r"); // 4th pick
    expect(sortQueue(list, me, now, 7)[0].id).toBe("r"); // 8th pick
    expect(sortQueue([fresh("f", "2026-11-04T14:50:00")], me, now, 3)[0].id).toBe("f"); // no retry → fresh
  });

  it("no fresh lead → retries oldest due first", () => {
    const now = T("2026-11-04T15:00:00");
    const list = [retry("r2", "2026-11-04T12:30:00", "2026-11-04T14:30:00"), retry("r1", "2026-11-04T12:00:00", "2026-11-04T14:00:00")];
    expect(sortQueue(list, me, now).map((o) => o.id)).toEqual(["r1", "r2"]);
  });

  it("starvation guard: >3 h fresh or overdue retry jumps ahead of newer fresh, oldest first", () => {
    const now = T("2026-11-04T17:00:00");
    const list = [
      fresh("new", "2026-11-04T16:50:00"),
      fresh("starvedFresh", "2026-11-04T13:30:00"),
      retry("starvedRetry", "2026-11-04T11:00:00", "2026-11-04T13:00:00"),
      fresh("waiting2h", "2026-11-04T15:00:00"),
    ];
    expect(sortQueue(list, me, now).map((o) => o.id)).toEqual(["starvedRetry", "starvedFresh", "new", "waiting2h"]);
  });

  it("isRetryTurn counts today's hand-outs", () => {
    expect([0, 1, 2, 3, 4, 7].map((n) => isRetryTurn(n, 4))).toEqual([false, false, false, true, false, true]);
  });

  const backlogNow = T("2026-11-07T17:00:00");
  const backlog = [
    fresh("newest", "2026-11-07T16:45:00"),
    fresh("oldFresh", "2026-11-07T12:00:00"),
    retry("oldRetry", "2026-11-07T08:00:00", "2026-11-07T10:00:00"),
    retry("recentRetry", "2026-11-07T14:00:00", "2026-11-07T16:00:00"),
  ];
  it("backlog alternates odd old / even newest fresh, superseding every-fourth retry", () => {
    expect([0, 1, 2, 3, 4, 5].map((p) => sortQueue(backlog, me, backlogNow, p)[0].id))
      .toEqual(["oldRetry", "newest", "oldRetry", "newest", "oldRetry", "newest"]);
  });
  it("backlog_mix 3 gives one old then two fresh per operator's daily counter", () => {
    const s = { retryGapMinutes: 120, maxAttempts: 3, workStart: "10:00", workEnd: "21:00", backlogMix: 3 };
    expect([0, 1, 2, 3, 4, 5].map((p) => sortQueue(backlog, me, backlogNow, p, s)[0].id))
      .toEqual(["oldRetry", "newest", "newest", "oldRetry", "newest", "newest"]);
  });
  it("empty fresh lane falls back to oldest overdue retry on even picks", () => {
    expect(sortQueue(backlog.filter((o) => o.call_attempt_count), me, backlogNow, 1)[0].id).toBe("oldRetry");
  });
  it("empty guard lane falls back to newest fresh on odd picks", () => {
    expect(sortQueue([backlog[0]], me, backlogNow, 0)[0].id).toBe("newest");
  });
  it("old fresh leads alone still alternate oldest and newest", () => {
    const list = [fresh("oldest", "2026-11-07T11:00:00"), fresh("lessOld", "2026-11-07T12:00:00")];
    expect(sortQueue(list, me, backlogNow, 0)[0].id).toBe("oldest");
    expect(sortQueue(list, me, backlogNow, 1)[0].id).toBe("lessOld");
  });
  it("eligible callbacks win on both lanes, future or sticky callbacks stay excluded", () => {
    const cb = { ...fresh("callback", "2026-11-07T12:00:00"), call_outcome: "callback", next_call_after: T("2026-11-07T16:55:00").toISOString(), queue_last_touched_by: me };
    expect([0, 1, 3].map((p) => sortQueue([...backlog, cb], me, backlogNow, p)[0].id)).toEqual(["callback", "callback", "callback"]);
    expect(sortQueue([...backlog, { ...cb, next_call_after: T("2026-11-07T18:00:00").toISOString() }], me, backlogNow, 1)[0].id).toBe("newest");
  });
  it("pending_details participates in the newest fresh lane after its existing grace", () => {
    const phoneOnly = { ...fresh("phoneOnly", "2026-11-07T16:49:00"), status: "pending_details" };
    expect(sortQueue([...backlog, phoneOnly], me, backlogNow, 1)[0].id).toBe("phoneOnly");
  });
  it("morning without carried-over retries alternates backlog with newest eligible daytime leads", () => {
    const list = [fresh("evening", "2026-11-06T22:00:00"), fresh("today", "2026-11-07T10:15:00")];
    const now = T("2026-11-07T10:30:00");
    expect(sortQueue(list, me, now, 0)[0].id).toBe("evening");
    expect(sortQueue(list, me, now, 1)[0].id).toBe("today");
  });
});
