import { describe, it, expect } from "vitest";
import { buildTeamRows, idleLevel, shiftSecondsToday } from "@/lib/callQueueTeamMetrics";

const todayStart = Date.parse("2026-11-01T20:00:00Z"); // Tbilisi midnight Nov 2
const now = todayStart + 12 * 3600e3; // 12:00 Tbilisi
const at = (h: number, m = 0) => new Date(todayStart + h * 3600e3 + m * 60e3).toISOString();
const ev = (order_id: string, actor: string, created_at: string, payload: any) => ({ order_id, actor, created_at, payload });

const base = {
  now, todayStart, extraEvents: [] as any[], sessions: [] as any[], locks: [] as any[], lockMinutes: 10,
  shifts: [{ operator: "a@x.ge", started_at: at(10), ended_at: null, paused: false }],
  orderTotals: new Map([["o1", 50], ["o2", 30]]),
};

describe("buildTeamRows", () => {
  it("counts confirmed, cancelled (excluding duplicates) and conversion", () => {
    const rows = buildTeamRows({
      ...base,
      outcomes: [
        ev("o1", "a@x.ge", at(10, 5), { outcome: "confirmed" }),
        ev("o2", "a@x.ge", at(10, 10), { outcome: "confirmed" }),
        ev("o3", "a@x.ge", at(10, 20), { outcome: "cancelled", cancel_reason: "changed_mind" }),
        ev("o4", "a@x.ge", at(10, 30), { outcome: "cancelled", cancel_reason: "duplicate_order" }),
        ev("o5", "a@x.ge", at(11), { outcome: "no_answer" }),
      ],
    });
    const r = rows[0];
    expect(r.calls).toBe(5);
    expect(r.confirmed).toBe(2);
    expect(r.cancelled).toBe(1);
    expect(r.noAnswer).toBe(1);
    expect(r.conversion).toBeCloseTo(2 / 3);
    expect(r.confirmedRevenue).toBe(80);
    expect(r.hourly[10]).toBe(4);
    expect(r.hourly[11]).toBe(1);
  });

  it("excludes the stats-excluded account", () => {
    const rows = buildTeamRows({ ...base, shifts: [], outcomes: [ev("o1", "info@bigmart.ge", at(10), { outcome: "confirmed" })] });
    expect(rows).toHaveLength(0);
  });

  it("idle time is since last outcome while on shift; orders/hour uses shift hours", () => {
    const rows = buildTeamRows({ ...base, outcomes: [ev("o1", "a@x.ge", at(11, 50), { outcome: "confirmed" })] });
    expect(rows[0].idleSeconds).toBe(600);
    expect(rows[0].ordersPerHour).toBeCloseTo(0.5);
    expect(rows[0].status).toBe("on_shift");
  });

  it("7-day average uses the previous 7 days only", () => {
    const old = new Date(todayStart - 2 * 86400e3).toISOString();
    const rows = buildTeamRows({ ...base, outcomes: [
      ev("p1", "a@x.ge", old, { outcome: "confirmed" }),
      ev("p2", "a@x.ge", old, { outcome: "confirmed" }),
      ev("p3", "a@x.ge", old, { outcome: "cancelled" }),
    ] });
    expect(rows[0].week.confirmedPerDay).toBeCloseTo(2 / 7);
    expect(rows[0].week.conversion).toBeCloseTo(2 / 3);
    expect(rows[0].calls).toBe(0);
  });

  it("counts upsell and undos today", () => {
    const rows = buildTeamRows({ ...base, outcomes: [], extraEvents: [
      { order_id: "o1", actor: "a@x.ge", created_at: at(10), event_type: "item_added", payload: { unit_price: 10, quantity: 2 } },
      { order_id: "o1", actor: "a@x.ge", created_at: at(10), event_type: "item_quantity_change", payload: { delta_total: -5 } },
      { order_id: "o1", actor: "a@x.ge", created_at: at(10), event_type: "outcome_undone", payload: {} },
    ] });
    expect(rows[0].upsell).toBe(20);
    expect(rows[0].undos).toBe(1);
  });
});

describe("helpers", () => {
  it("idle colours", () => {
    expect(idleLevel(200)).toBe("ok");
    expect(idleLevel(301)).toBe("amber");
    expect(idleLevel(601)).toBe("red");
  });
  it("shift seconds clip to today", () => {
    expect(shiftSecondsToday([{ operator: "a", started_at: new Date(todayStart - 3600e3).toISOString(), ended_at: at(1), paused: false }], todayStart, now)).toBe(3600);
  });
});
