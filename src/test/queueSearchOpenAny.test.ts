import { describe, it, expect } from "vitest";
import { phoneLast9, orderActions, statusBadge } from "@/lib/queueSearchRules";

describe("phone search matching (last 9 digits)", () => {
  it("normalises +995 / 995 / 0 / spaces / dashes to the same 9 digits", () => {
    for (const t of ["+995 555 12-34-56", "995555123456", "0555123456", "555 12 34 56", "555-123-456"])
      expect(phoneLast9(t)).toMatch(/^5551234(56|56)$|^555123456$/);
    expect(phoneLast9("+995 555 12-34-56")).toBe("555123456");
    expect(phoneLast9("0555123456")).toBe("555123456");
  });
  it("short input is not a phone (falls back to order number)", () => {
    expect(phoneLast9("124690")).toBeNull();
  });
});

describe("outcome buttons for an order opened from search", () => {
  it("cancelled order: confirm and callback enabled (reopen), no-answer and cancel disabled", () => {
    const a = orderActions({ status: "canceled", is_confirmed: false });
    expect(a.enabled).toEqual({ confirm: true, no_answer: false, callback: true, cancel: false });
    expect(a.reopens).toBe(true);
    expect(a.canEdit).toBe(true);
  });
  it("open lead: all four outcomes enabled", () => {
    expect(orderActions({ status: "new" }).enabled).toEqual({ confirm: true, no_answer: true, callback: true, cancel: true });
  });
  it("confirmed, not shipped: only cancel", () => {
    expect(orderActions({ status: "confirmed", is_confirmed: true }).enabled).toEqual({ confirm: false, no_answer: false, callback: false, cancel: true });
  });
  it("already at the courier: every outcome and edit disabled with a note", () => {
    for (const o of [
      { status: "confirmed", is_confirmed: true, onway_sent_at: "2026-11-04T08:00:00Z" },
      { status: "shipped", is_fulfilled: true },
      { status: "confirmed", is_confirmed: true, packing_wave_id: "w1" },
      { status: "canceled", onway_tracking: "ON123" },
    ]) {
      const a = orderActions(o);
      expect(Object.values(a.enabled).every((v) => !v)).toBe(true);
      expect(a.canEdit).toBe(false);
      expect(a.note).toContain("already sent to courier");
    }
  });
  it("merged and return orders cannot get outcomes", () => {
    expect(Object.values(orderActions({ status: "merged" }).enabled).some(Boolean)).toBe(false);
    expect(Object.values(orderActions({ status: "return_review", is_return: true }).enabled).some(Boolean)).toBe(false);
  });
});

describe("status badge", () => {
  it("shows cancelled / no answer / callback / shipped", () => {
    expect(statusBadge({ status: "canceled" }).label).toBe("გაუქმებული");
    expect(statusBadge({ status: "on_hold", call_attempt_count: 2 }).label).toBe("არ პასუხობს ×2");
    expect(statusBadge({ status: "on_hold", call_outcome: "callback" }).label).toBe("გადასარეკი");
    expect(statusBadge({ status: "confirmed", is_confirmed: true, onway_sent_at: "x" }).tone).toBe("purple");
  });
});
