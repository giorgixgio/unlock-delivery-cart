import { describe, it, expect } from "vitest";
import { STANDARD_SHIPPING_FEE, normalizeOrderTotal, normalizeOrderAmounts } from "@/lib/orderPricing";

describe("orderPricing", () => {
  it("uses 6 GEL as the standard shipping fee", () => {
    expect(STANDARD_SHIPPING_FEE).toBe(6);
  });

  it("normalizes big fractional orders (>= 50 GEL) down and sacrifices 1 GEL at 5-GEL + 1 boundaries", () => {
    expect(normalizeOrderTotal(51.273636363)).toBe(50);
    expect(normalizeOrderTotal(51.400000000000006)).toBe(50);
    expect(normalizeOrderTotal(56.55)).toBe(55);
    expect(normalizeOrderTotal(61.550000000000004)).toBe(60);
    expect(normalizeOrderTotal(101.55)).toBe(100);
    expect(normalizeOrderTotal(52.4)).toBe(52);
    expect(normalizeOrderTotal(62.55)).toBe(62);
    expect(normalizeOrderTotal(84.4)).toBe(84);
  });

  it("rounds small fractional orders (< 50 GEL) up to our advantage", () => {
    expect(normalizeOrderTotal(36.4)).toBe(37);
    expect(normalizeOrderTotal(43.05)).toBe(44);
    expect(normalizeOrderTotal(44.4)).toBe(45);
    expect(normalizeOrderTotal(49.1)).toBe(50);
  });

  it("leaves clean integers and zero/negative totals unchanged", () => {
    expect(normalizeOrderTotal(0)).toBe(0);
    expect(normalizeOrderTotal(30)).toBe(30);
    expect(normalizeOrderTotal(35)).toBe(35);
    expect(normalizeOrderTotal(51)).toBe(51);
    expect(normalizeOrderTotal(51.00000000000001)).toBe(51);
  });

  it("keeps subtotal + shippingFee - discountTotal equal to the normalized total", () => {
    const small = normalizeOrderAmounts(38.4, 6);
    expect(small).toEqual({ subtotal: 39, shippingFee: 6, discountTotal: 0, total: 45 });
    expect(small.subtotal + small.shippingFee - small.discountTotal).toBe(small.total);

    const big = normalizeOrderAmounts(45.273636363, 6);
    expect(big).toEqual({ subtotal: 44, shippingFee: 6, discountTotal: 0, total: 50 });
    expect(big.subtotal + big.shippingFee - big.discountTotal).toBe(big.total);
  });
});