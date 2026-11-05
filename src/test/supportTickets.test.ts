import { describe, expect, it } from "vitest";
import { addWorkingDays, quietShift, sortTickets, supportSendAt } from "@/lib/supportTickets";
import { isQueueOpen, orderActions } from "@/lib/queueSearchRules";
import { queueTier } from "@/lib/callQueuePolicy";

// Tbilisi = UTC+4
const tbs = (s: string) => new Date(`${s}+04:00`);

describe("support ticket rules", () => {
  it("SLA: 2 working days from Friday 15:00 is Tuesday 15:00", () => {
    expect(addWorkingDays(tbs("2026-11-06T15:00:00"), 2).toISOString()).toBe(tbs("2026-11-10T15:00:00").toISOString());
  });
  it("SLA: 2 working days from Monday 10:00 is Wednesday 10:00", () => {
    expect(addWorkingDays(tbs("2026-11-02T10:00:00"), 2).toISOString()).toBe(tbs("2026-11-04T10:00:00").toISOString());
  });
  it("ack created 20:58 (+5 min = 21:03) moves to 09:00 next day", () => {
    expect(supportSendAt(tbs("2026-11-05T21:03:00"), null).toISOString()).toBe(tbs("2026-11-06T09:00:00").toISOString());
  });
  it("text at 07:30 moves to 09:00 the same day", () => {
    expect(quietShift(tbs("2026-11-05T07:30:00")).toISOString()).toBe(tbs("2026-11-05T09:00:00").toISOString());
  });
  it("second update 10 min after the previous text waits for the 30-min gap", () => {
    const last = tbs("2026-11-05T12:00:00");
    expect(supportSendAt(tbs("2026-11-05T12:10:00"), last, 30).toISOString()).toBe(tbs("2026-11-05T12:30:00").toISOString());
  });
  it("customer reply sorts first, then overdue, then oldest", () => {
    const now = tbs("2026-11-10T12:00:00");
    const base = { status: "open", staff_seen_at: null, last_customer_reply_at: null };
    const rows = [
      { ...base, id: "old", created_at: "2026-11-01T00:00:00Z", sla_due_at: "2026-11-20T00:00:00Z" },
      { ...base, id: "overdue", created_at: "2026-11-05T00:00:00Z", sla_due_at: "2026-11-09T00:00:00Z" },
      { ...base, id: "reply", created_at: "2026-11-08T00:00:00Z", sla_due_at: "2026-11-20T00:00:00Z", last_customer_reply_at: "2026-11-09T00:00:00Z" },
    ];
    expect(sortTickets(rows, now).map((r) => r.id)).toEqual(["reply", "overdue", "old"]);
  });
  it("a held lead is not in the queue and has no outcome buttons", () => {
    const o = { id: "x", created_at: "2026-01-01T00:00:00Z", status: "new", support_hold: true };
    expect(isQueueOpen(o)).toBe(false);
    expect(queueTier(o, "a@b.c", new Date())).toBeNull();
    expect(orderActions(o).enabled.confirm).toBe(false);
  });
});
