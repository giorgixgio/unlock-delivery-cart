import { describe, it, expect } from "vitest";
import { outcomeLockFor } from "@/lib/outcomeLock";

const on = { operators_use_queue: true, manager_emails: ["eto@bigmart.ge"] };
describe("outcomeLockFor", () => {
  it("switch off → unlocked", () => {
    expect(outcomeLockFor("operator", "eto@bigmart.ge", { ...on, operators_use_queue: false }).locked).toBe(false);
  });
  it("manager + switch on → locked", () => {
    const r = outcomeLockFor("operator", "Eto@Bigmart.ge", on);
    expect(r.locked).toBe(true);
    expect(r.reason).toBe("Calls are made from the Call Queue");
  });
  it("admin → unlocked even if listed as manager", () => {
    expect(outcomeLockFor("admin", "eto@bigmart.ge", on).locked).toBe(false);
  });
  it("plain operator + switch on → locked", () => {
    expect(outcomeLockFor("operator", "a@x.ge", on).locked).toBe(true);
  });
  it("plain operator + switch off → unlocked", () => {
    expect(outcomeLockFor("operator", "a@x.ge", { ...on, operators_use_queue: false }).locked).toBe(false);
  });
  it("settings not loaded → unlocked", () => {
    expect(outcomeLockFor("operator", "eto@bigmart.ge", null).locked).toBe(false);
  });
});
