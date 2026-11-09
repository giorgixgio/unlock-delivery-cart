import { describe, it, expect } from "vitest";
import { TEST_SKUS } from "@/lib/testProducts";
import { TEST_SKUS as EDGE_TEST_SKUS, isTestOrder } from "../../supabase/functions/_shared/testOrders";

describe("test order isolation rule", () => {
  it("edge functions use the same test SKU list as the Test orders tab", () => {
    expect([...EDGE_TEST_SKUS].sort()).toEqual([...TEST_SKUS].map((s) => s.toLowerCase()).sort());
  });
  it("an order with a test1 or test4 line is a test order", () => {
    expect(isTestOrder({ order_items: [{ sku: "disc" }, { sku: "test1" }] })).toBe(true);
    expect(isTestOrder({ order_items: [{ sku: "TEST4 " }] })).toBe(true);
  });
  it("an order tagged test_sku is a test order", () => {
    expect(isTestOrder({ tags: ["test_sku"], order_items: [] })).toBe(true);
  });
  it("a normal order is not a test order", () => {
    expect(isTestOrder({ tags: ["landing:x"], order_items: [{ sku: "0019" }] })).toBe(false);
  });
});
