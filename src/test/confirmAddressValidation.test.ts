import { describe, it, expect } from "vitest";
import { validateConfirmAddress } from "@/lib/confirmAddressValidation";

describe("validateConfirmAddress", () => {
  it("blocks when city is empty", () => {
    expect(validateConfirmAddress("  ", "", "რუსთაველის 5")).toMatchObject({ ok: false, field: "city" });
  });
  it("blocks Tbilisi without district", () => {
    expect(validateConfirmAddress("თბილისი", "", "ჭავჭავაძის 12")).toMatchObject({ ok: false, field: "district" });
    expect(validateConfirmAddress("Tbilisi", " ", "Chavchavadze 12")).toMatchObject({ ok: false, field: "district" });
  });
  it("blocks address shorter than 3 characters", () => {
    expect(validateConfirmAddress("ქუთაისი", "", "ab")).toMatchObject({ ok: false, field: "address" });
    expect(validateConfirmAddress("თბილისი", "ვაკე", " 1 ")).toMatchObject({ ok: false, field: "address" });
  });
  it("accepts a 3-character address", () => {
    expect(validateConfirmAddress("ქუთაისი", "", "abc")).toEqual({ ok: true });
  });
  it("does not require district outside Tbilisi", () => {
    expect(validateConfirmAddress("ბათუმი", "", "გორგასლის 10")).toEqual({ ok: true });
  });
  it("accepts Tbilisi with district and address", () => {
    expect(validateConfirmAddress("თბილისი", "ვაკე", "ჭავჭავაძის 12")).toEqual({ ok: true });
  });
});
