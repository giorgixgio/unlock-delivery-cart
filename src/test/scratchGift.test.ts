import { describe, it, expect } from "vitest";
import { buildScratchGiftItems, itemsRevenue, unitsToPack, scratchGiftEligible, itemSummary, SCRATCH_GIFT_SKU } from "@/lib/scratchGift";
import { courierLabelText, itemsDescription, parcelWeightKg } from "../../supabase/functions/_shared/courierLabel";
import type { Product } from "@/lib/constants";

const disc = { id: "d", sku: SCRATCH_GIFT_SKU, title: "ხის დისკი", price: 24, image: "" } as unknown as Product;

describe("scratch-card +1 gift", () => {
  it("does not change the order total", () => {
    expect(itemsRevenue(buildScratchGiftItems(disc, 2, true))).toBe(48);
    expect(itemsRevenue(buildScratchGiftItems(disc, 2, false))).toBe(48);
  });
  it("units to pack = chosen qty + 1", () => {
    expect(unitsToPack(buildScratchGiftItems(disc, 2, true))).toBe(3);
    expect(unitsToPack(buildScratchGiftItems(disc, 1, false))).toBe(1);
  });
  it("gift is a separate 0 ₾ line flagged as gift", () => {
    const g = buildScratchGiftItems(disc, 3, true)[1];
    expect(g).toMatchObject({ quantity: 1, isGift: true });
    expect(g.product.price).toBe(0);
  });
  it("never applies to test SKUs or other products", () => {
    expect(scratchGiftEligible("testtaro")).toBe(false);
    expect(scratchGiftEligible("002")).toBe(false);
    expect(buildScratchGiftItems({ ...disc, sku: "testtaro" } as Product, 2, true)).toHaveLength(1);
  });
  it("admin summary shows paid + gift", () => {
    expect(itemSummary([{ sku: SCRATCH_GIFT_SKU, title: "ხის დისკი", quantity: 2 }, { sku: SCRATCH_GIFT_SKU, title: "ხის დისკი", quantity: 1, is_gift: true }]))
      .toBe("ხის დისკი × 3 (2 + 1 🎁 საჩუქარი)");
  });
});

describe("courier label / Onway with gift", () => {
  const items = [{ sku: SCRATCH_GIFT_SKU, quantity: 2, title: "ხის დისკი" }, { sku: SCRATCH_GIFT_SKU, quantity: 1, title: "ხის დისკი", is_gift: true }];
  it("label text includes the gift in the total", () => {
    expect(courierLabelText("S-0001", items, { [SCRATCH_GIFT_SKU]: "B12" })).toBe("[S-0001] B12 - 3 (+1 საჩუქარი)");
    expect(itemsDescription(items)).toBe("ხის დისკი x3 (+1 საჩუქარი)");
  });
  it("labels without a gift are unchanged", () => {
    expect(courierLabelText("S-0001", [{ sku: "A", quantity: 2 }], { A: "7" })).toBe("[S-0001] 7 - 2");
  });
  it("total weight includes the gift unit", () => {
    expect(parcelWeightKg(items, { [SCRATCH_GIFT_SKU]: 0.4 })).toBe(1.2);
    expect(parcelWeightKg(items.slice(0, 1), { [SCRATCH_GIFT_SKU]: 0.4 })).toBe(1);
  });
});
