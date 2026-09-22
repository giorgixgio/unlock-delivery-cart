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