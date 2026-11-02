import { describe, expect, it } from "vitest";
import { attemptsPerResolved, calculateCapacity, workedSeconds } from "@/lib/operatorStatsEngine";

describe("operatorStatsEngine", () => {
  it("counts nearby action gaps and treats gaps over 15 minutes as breaks", () => {
    const seconds = workedSeconds([
      { operator: "a", at: "2026-09-22T08:00:00Z" },
      { operator: "a", at: "2026-09-22T08:10:00Z" },
      { operator: "a", at: "2026-09-22T09:00:00Z" },
    ]);
    expect(seconds).toBe(720); // 10 minutes + 2-minute day tail
  });

  it("counts every attempt on orders resolved in the period", () => {
    expect(attemptsPerResolved([
      { orderId: "1", outcome: "no_answer" },
      { orderId: "1", outcome: "confirmed" },
      { orderId: "2", outcome: "callback" },
    ])).toBe(2);
  });

  it("rounds required operators up", () => {
    expect(calculateCapacity({ targetLeads: 100, autoConfirmShare: 0.2, minutesPerLeadNeedingOperator: 12, shiftHours: 8, targetUtilization: 0.75 }))
      .toEqual({ leadsNeedingOperator: 80, operatorHours: 16, operatorsNeeded: 3 });
  });
});
import { isDuplicateCancel, latestFinalByOrder, openQueue, operatorOutcomes, previousRangeFor, rangeFor } from "@/lib/operatorStatsEngine";

describe("previous period alignment", () => {
  const now = new Date("2026-11-02T10:25:00Z"); // 14:25 Tbilisi
  it("today → yesterday 00:00 to same clock time", () => {
    const r = rangeFor("today", "", "", now), p = previousRangeFor("today", r);
    expect(r.from.toISOString()).toBe("2026-11-01T20:00:00.000Z");
    expect(p.from.toISOString()).toBe("2026-10-31T20:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-11-01T10:25:00.000Z");
  });
  it("yesterday → the day before", () => {
    const p = previousRangeFor("yesterday", rangeFor("yesterday", "", "", now));
    expect(p.from.toISOString()).toBe("2026-10-30T20:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-31T19:59:59.999Z");
  });
  it("7d → previous 7 days ending at same clock time", () => {
    const p = previousRangeFor("7d", rangeFor("7d", "", "", now));
    expect(p.from.toISOString()).toBe("2026-10-19T20:00:00.000Z");
    expect(p.to.toISOString()).toBe("2026-10-26T10:25:00.000Z");
  });
});

const ev = (order_id: string, actor: string, created_at: string, payload: any) => ({ order_id, actor, created_at, payload });

describe("overturned cancels", () => {
  it("a cancel later confirmed by another operator is overturned, not cancelled", () => {
    const calls = [ev("o1", "A", "2026-11-02T08:00:00Z", { outcome: "cancelled" }), ev("o2", "A", "2026-11-02T08:05:00Z", { outcome: "cancelled" })];
    const later = [ev("o1", "B", "2026-11-03T08:00:00Z", { outcome: "confirmed" })];
    const r = operatorOutcomes("A", calls, [...calls, ...later]);
    expect(r.overturned).toBe(1);
    expect(r.cancelled.length).toBe(1);
    expect(r.conversion).toBe(0);
    expect(r.resolved).toBe(1);
  });
});

describe("duplicate exclusion", () => {
  it("treats cancel_reason duplicate_order like duplicate_cleanup", () => {
    const d1 = ev("o1", "A", "2026-11-02T08:00:00Z", { outcome: "cancelled", cancel_reason: "duplicate_order" });
    const d2 = ev("o2", "A", "2026-11-02T08:00:00Z", { outcome: "cancelled", source: "duplicate_cleanup" });
    expect(isDuplicateCancel(d1) && isDuplicateCancel(d2)).toBe(true);
    expect(latestFinalByOrder([d1, d2]).size).toBe(0);
    expect(operatorOutcomes("A", [d1, d2], [d1, d2]).resolved).toBe(0);
  });
});

describe("open queue", () => {
  it("splits never-called and due callbacks independent of range", () => {
    const now = Date.parse("2026-11-02T10:00:00Z");
    expect(openQueue([
      { id: "1", status: "new", is_return: false, call_attempt_count: 0, next_call_after: null },
      { id: "2", status: "on_hold", is_return: false, call_attempt_count: 2, next_call_after: "2026-11-02T09:00:00Z" },
      { id: "3", status: "on_hold", is_return: false, call_attempt_count: 1, next_call_after: "2026-11-02T12:00:00Z" },
    ], now)).toEqual({ open: 2, neverCalled: 1, callbacksDue: 1 });
  });
});

import { callbackTimeliness, deliverySummary, findGiveUps, findSkips, quickDecisions, reasonMix, scoreColor, speedStats } from "@/lib/operatorStatsEngine";

describe("quality: give-ups", () => {
  const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-05T00:00:00Z") };
  it("counts never-reached cancels; early when <3 no-answers", () => {
    const evs = [
      ev("o1", "A", "2026-11-01T08:00:00Z", { outcome: "no_answer" }),
      ev("o1", "A", "2026-11-01T10:00:00Z", { outcome: "cancelled" }),
      ev("o2", "A", "2026-11-01T08:00:00Z", { outcome: "callback" }),
      ev("o2", "A", "2026-11-02T08:00:00Z", { outcome: "cancelled" }),
      ev("o3", "A", "2026-11-01T08:00:00Z", { outcome: "cancelled", cancel_reason: "duplicate_order" }),
    ];
    const g = findGiveUps(evs, range);
    expect(g.map((x) => x.orderId)).toEqual(["o1"]);
    expect(g[0].early).toBe(true);
    expect(g[0].hours).toBe(2);
  });
  it("is not early with 3 no-answers over two days", () => {
    const evs = [
      ev("o1", "A", "2026-11-01T06:00:00Z", { outcome: "no_answer" }),
      ev("o1", "A", "2026-11-01T12:00:00Z", { outcome: "no_answer" }),
      ev("o1", "A", "2026-11-02T08:00:00Z", { outcome: "no_answer" }),
      ev("o1", "A", "2026-11-02T09:00:00Z", { outcome: "cancelled" }),
    ];
    expect(findGiveUps(evs, range)[0].early).toBe(false);
  });
});

describe("quality: skips, quick decisions, reasons", () => {
  const s = (order_id: string, operator: string, at: string, act = false, sec = 10) => ({ order_id, operator, session_started_at: at, active_duration_seconds: sec, capped_duration_seconds: null, had_meaningful_action: act });
  it("skipped = viewed without action and later done by another operator", () => {
    const r = findSkips("A", [s("o1", "A", "2026-11-01T08:00:00Z"), s("o2", "A", "2026-11-01T08:00:00Z")], [ev("o1", "B", "2026-11-01T09:00:00Z", { outcome: "confirmed" })]);
    expect(r.viewed.length).toBe(2);
    expect(r.skipped).toEqual(["o1"]);
  });
  it("quick cancel under 15s, quick confirm under 20s", () => {
    const sessions = [s("o1", "A", "2026-11-01T08:00:00Z", true, 10), s("o2", "A", "2026-11-01T08:00:00Z", true, 18)];
    const r = quickDecisions([ev("o1", "A", "2026-11-01T08:00:10Z", { outcome: "cancelled" }), ev("o2", "A", "2026-11-01T08:00:18Z", { outcome: "confirmed" })], sessions);
    expect(r.quickCancels).toEqual(["o1"]);
    expect(r.quickConfirms).toEqual(["o2"]);
  });
  it("flags vague reasons above 20%", () => {
    expect(reasonMix([ev("o1", "A", "x", { cancel_reason: "other" }), ev("o2", "A", "x", { cancel_reason: "changed_mind" })]).flagged).toBe(true);
  });
});

describe("quality: speed, callbacks, delivery, scoring", () => {
  it("only counts in-hours leads", () => {
    const r = speedStats([{ id: "a", created_at: "2026-11-01T08:00:00Z" }, { id: "b", created_at: "2026-11-01T20:00:00Z" }], new Map([["a", Date.parse("2026-11-01T08:10:00Z")]]), 10, 21);
    expect(r).toEqual({ leads: 1, in15: 1, in60: 1 });
  });
  it("callback on time within 60 minutes of next_call_after", () => {
    const range = { from: new Date("2026-11-01T00:00:00Z"), to: new Date("2026-11-02T00:00:00Z") };
    const rows = callbackTimeliness([
      ev("o1", "A", "2026-11-01T08:00:00Z", { outcome: "no_answer", next_call_after: "2026-11-01T10:00:00Z" }),
      ev("o1", "B", "2026-11-01T12:00:00Z", { outcome: "confirmed" }),
    ], range, Date.parse("2026-11-03T00:00:00Z"));
    expect(rows.length).toBe(1);
    expect(rows[0].onTime).toBe(false);
    expect(rows[0].recalled).toBe(true);
  });
  it("delivery rate = delivered ÷ (delivered + failed)", () => {
    const d = deliverySummary([
      { order_id: "1", operator: "A", total: 40, status: "DELIVERED_TO_CUSTOMER", matched: true },
      { order_id: "2", operator: "A", total: 40, status: "RETURNED_TO_SENDER", matched: true },
      { order_id: "3", operator: "A", total: 40, status: "IN_TRANSIT", matched: true },
      { order_id: "4", operator: "A", total: 40, status: "UNMATCHED", matched: false },
    ]);
    expect(d.deliveryRate).toBe(0.5);
    expect(d.revenue).toBe(40);
    expect(d.coverage).toBe(0.75);
  });
  it("colours against the median by direction", () => {
    expect(scoreColor(0.5, 0.6, true)).toBe("amber");
    expect(scoreColor(0.3, 0.6, true)).toBe("red");
    expect(scoreColor(5, 10, false)).toBe("green");
  });
});
