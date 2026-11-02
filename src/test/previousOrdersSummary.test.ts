import { describe, it, expect } from "vitest";
import { summarizePreviousOrders } from "@/lib/previousOrdersSummary";

const now = new Date("2026-11-02T12:00:00Z");
const o = (daysAgo: number, status: string, sku = "X") => ({
  created_at: new Date(now.getTime() - daysAgo * 86400e3).toISOString(), status, order_items: [{ sku }],
});

describe("summarizePreviousOrders", () => {
  it("builds the one-line summary", () => {
    const s = summarizePreviousOrders([o(1, "canceled", "A"), o(40, "delivered", "A"), o(50, "delivered", "B")], ["A"], now);
    expect(s.line).toBe("3 previous · 1 cancelled · 2 delivered · 2× same product");
  });
  it("is red with 2+ cancels in the last 30 days", () => {
    expect(summarizePreviousOrders([o(2, "canceled"), o(10, "canceled")], ["Z"], now).level).toBe("red");
  });
  it("is amber with 2+ same-product orders in the last 30 days", () => {
    expect(summarizePreviousOrders([o(2, "delivered", "A"), o(5, "new", "A")], ["A"], now).level).toBe("amber");
  });
  it("ignores orders older than 30 days for colouring", () => {
    expect(summarizePreviousOrders([o(31, "canceled"), o(45, "canceled")], ["A"], now).level).toBe("none");
  });
});
