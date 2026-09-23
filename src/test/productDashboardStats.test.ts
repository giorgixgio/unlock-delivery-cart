import { describe, it, expect } from "vitest";
import { aggregateProductStats, type PdsOrder, type PdsItem } from "@/lib/productDashboardStats";

const o = (id: string, extra: Partial<PdsOrder> = {}): PdsOrder => ({
  id, status: "new", is_confirmed: false, is_fulfilled: false, auto_confirmed: false, created_at: "2026-09-20T08:00:00Z", ...extra,
});
const it_ = (order_id: string, product_id: string, line_total = 10): PdsItem => ({
  order_id, product_id, sku: product_id.toUpperCase(), title: product_id, image_url: "", quantity: 1, line_total,
});

describe("productDashboardStats", () => {
  it("excludes operator-added items from leads and counts them as upsold", () => {
    const { products } = aggregateProductStats(
      [o("1", { is_confirmed: true })],
      [it_("1", "a"), it_("1", "b")],
      [{ order_id: "1", payload: { product_id: "b", sku: "B" } }],
    );
    const a = products.find((p) => p.productId === "a")!;
    const b = products.find((p) => p.productId === "b")!;
    expect(a.leads).toBe(1);
    expect(b.leads).toBe(0);
    expect(b.upsold).toBe(1);
  });

  it("counts multi-product orders under each product but summary uses unique orders", () => {
    const { products, summary } = aggregateProductStats(
      [o("1"), o("2"), o("m", { status: "merged" })],
      [it_("1", "a"), it_("1", "b"), it_("2", "a"), it_("m", "a")],
      [],
    );
    expect(products.find((p) => p.productId === "a")!.leads).toBe(2);
    expect(products.find((p) => p.productId === "b")!.leads).toBe(1);
    expect(summary.uniqueLeads).toBe(2);
  });

  it("confirm rate keeps canceled in the denominator; confirmed-then-canceled is not confirmed", () => {
    const { products, summary } = aggregateProductStats(
      [o("1", { is_confirmed: true, auto_confirmed: true }), o("2", { is_fulfilled: true }), o("3", { status: "canceled", is_confirmed: true }), o("4")],
      [it_("1", "a"), it_("2", "a"), it_("3", "a", 99), it_("4", "a")],
      [],
    );
    const a = products[0];
    expect(a.leads).toBe(4);
    expect(a.confirmed).toBe(2);
    expect(a.canceled).toBe(1);
    expect(a.pending).toBe(1);
    expect(a.confirmRate).toBe(0.5);
    expect(a.autoShare).toBe(0.5);
    expect(a.revenue).toBe(30);
    expect(summary.confirmRate).toBe(0.5);
  });
});
