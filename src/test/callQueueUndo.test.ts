import { describe, it, expect } from "vitest";
import {
  canUndo, buildSnapshot, UNDO_WINDOW_MS, UNDO_TOAST_MS, SNAPSHOT_BACKDATE_MS,
  undoBarDeadlineMs, undoBarFraction, type UndoAction, type UndoOrderState,
} from "@/lib/callQueueUndo";


const T0 = Date.parse("2026-11-02T10:00:00Z");
const action = (over: Partial<UndoAction> = {}): UndoAction => ({
  orderId: "o1", orderNumber: "123", outcome: "confirmed", actor: "op@x.ge",
  takenAt: new Date(T0).toISOString(), snapshot: {}, ...over,
});
const clean: UndoOrderState = { status: "confirmed", is_fulfilled: false, onway_sent_at: null, onway_tracking: null, packed_at: null, packing_wave_id: null, touchedByOther: false };

describe("canUndo", () => {
  it("allows the same operator within 5 minutes", () => {
    expect(canUndo(action(), "OP@x.ge", clean, T0 + 4 * 60_000).ok).toBe(true);
  });
  it("blocks after 5 minutes", () => {
    expect(canUndo(action(), "op@x.ge", clean, T0 + UNDO_WINDOW_MS + 1).ok).toBe(false);
  });
  it("blocks a different operator", () => {
    expect(canUndo(action(), "other@x.ge", clean, T0 + 1000).ok).toBe(false);
  });
  it("blocks once a newer outcome was recorded", () => {
    expect(canUndo(action({ superseded: true }), "op@x.ge", clean, T0 + 1000).ok).toBe(false);
  });
  it("blocks when sent to Onway", () => {
    expect(canUndo(action(), "op@x.ge", { ...clean, onway_sent_at: "2026-11-02T10:01:00Z" }, T0 + 1000).ok).toBe(false);
    expect(canUndo(action(), "op@x.ge", { ...clean, onway_tracking: "ON123" }, T0 + 1000).ok).toBe(false);
  });
  it("blocks when packed or fulfilled", () => {
    expect(canUndo(action(), "op@x.ge", { ...clean, packed_at: "x" }, T0 + 1000).ok).toBe(false);
    expect(canUndo(action(), "op@x.ge", { ...clean, packing_wave_id: "w" }, T0 + 1000).ok).toBe(false);
    expect(canUndo(action(), "op@x.ge", { ...clean, is_fulfilled: true }, T0 + 1000).ok).toBe(false);
  });
  it("blocks when someone else touched the order", () => {
    expect(canUndo(action(), "op@x.ge", { ...clean, touchedByOther: true }, T0 + 1000).ok).toBe(false);
  });
});

describe("buildSnapshot", () => {
  it("keeps outcome fields and drops address/items", () => {
    const s = buildSnapshot({ status: "new", call_attempt_count: 1, address_line1: "x", next_call_after: null }, "no_answer", "op", "t");
    expect(s.status).toBe("new");
    expect(s.call_attempt_count).toBe(1);
    expect(s.next_call_after).toBeNull();
    expect("address_line1" in s).toBe(false);
    expect(s.actor).toBe("op");
  });
});
