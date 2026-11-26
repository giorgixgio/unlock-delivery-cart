import { describe, expect, it } from "vitest";
import { payoutAdjustments, reconcilePaidPayout } from "@/lib/accountantPayoutReconciliation";

describe("paid accountant payout reconciliation", () => {
  it("reconciles a 108k delivered subtotal to the reported 82,998.99 paid net after pending and failed fees", () => {
    expect(reconcilePaidPayout(108300.24, 14069.95, 11231.30)).toBe(82998.99);
  });
  it("exports deductions as negative amounts, preserving negative pending balances", () => {
    expect(payoutAdjustments(14069.95, 11231.30).map((a) => a.amount)).toEqual([-14069.95, -11231.30]);
    expect(reconcilePaidPayout(100, -5, 10)).toBe(95);
  });
});