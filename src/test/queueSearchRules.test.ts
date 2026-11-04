import { describe, it, expect } from "vitest";
import {
  searchOpenDecision, directStatusChangeBlocked, validateOrderAddressForConfirm, classifyConfirmError, operatorName,
} from "@/lib/queueSearchRules";
import { outcomeLockFor } from "@/lib/outcomeLock";

const now = new Date("2026-11-04T12:00:00Z");
const open = { status: "new", is_confirmed: false, is_fulfilled: false };

describe("queue search open rules", () => {
  it("open and unlocked → assign", () => {
    expect(searchOpenDecision(open, "me@x.ge", now)).toEqual({ kind: "assign" });
  });
  it("open and locked by me → assign", () => {
    expect(searchOpenDecision({ ...open, queue_locked_by: "ME@x.ge", queue_locked_until: "2026-11-04T12:10:00Z" }, "me@x.ge", now)).toEqual({ kind: "assign" });
  });
  it("locked by another operator → refused with their name", () => {
    const d = searchOpenDecision({ ...open, queue_locked_by: "mariam@bigmart.ge", queue_locked_until: "2026-11-04T12:10:00Z" }, "me@x.ge", now);
    expect(d).toEqual({ kind: "locked", by: "mariam@bigmart.ge" });
    expect(operatorName("mariam@bigmart.ge")).toBe("Mariam");
  });
  it("expired lock by another → assign", () => {
    expect(searchOpenDecision({ ...open, queue_locked_by: "mariam@x.ge", queue_locked_until: "2026-11-04T11:59:00Z" }, "me@x.ge", now).kind).toBe("assign");
  });
  it("confirmed / fulfilled / cancelled → read-only", () => {
    expect(searchOpenDecision({ status: "confirmed", is_confirmed: true }, "me", now).kind).toBe("readonly");
    expect(searchOpenDecision({ status: "new", is_fulfilled: true }, "me", now).kind).toBe("readonly");
    expect(searchOpenDecision({ status: "canceled" }, "me", now).kind).toBe("readonly");
    expect(searchOpenDecision({ status: "new", auto_confirmed: true }, "me", now).kind).toBe("readonly");
  });
});

describe("direct status change lock", () => {
  const on = { operators_use_queue: true };
  it("non-admin with queue on cannot set confirmed / canceled / on_hold", () => {
    const lock = outcomeLockFor("operator", "op@x.ge", on);
    for (const to of ["confirmed", "canceled", "on_hold"]) expect(directStatusChangeBlocked(lock, "new", to)).toBe("Calls are made from the Call Queue");
    expect(directStatusChangeBlocked(lock, "confirmed", "shipped")).toBeNull();
  });
  it("admin and queue-off are unaffected", () => {
    expect(directStatusChangeBlocked(outcomeLockFor("admin", "a@x.ge", on), "new", "confirmed")).toBeNull();
    expect(directStatusChangeBlocked(outcomeLockFor("operator", "o@x.ge", { operators_use_queue: false }), "new", "confirmed")).toBeNull();
  });
});

describe("single-order confirm address check", () => {
  it("empty city/address (#124946 case) is refused", () => {
    expect(validateOrderAddressForConfirm({ city: null, address_line1: null }).ok).toBe(false);
  });
  it("complete regional address passes", () => {
    expect(validateOrderAddressForConfirm({ city: "ქუთაისი", address_line1: "რუსთაველის 5" }).ok).toBe(true);
  });
  it("classifies network vs db errors", () => {
    expect(classifyConfirmError("TypeError: Failed to fetch")).toBe("network");
    expect(classifyConfirmError("violates row-level security")).toBe("db_error");
  });
});
