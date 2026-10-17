import { describe, expect, it } from "vitest";
import { getFreeGiftOffer, isGiftPairSkuSet } from "@/lib/freeGiftOffers";

describe("SKU 0017 gift", () => {
  it("attaches warehouse SKU 17GIFT only to the 0017 base product", () => {
    expect(getFreeGiftOffer("G888-T4656-0017")?.giftSku).toBe("17GIFT");
    expect(getFreeGiftOffer("17GIFT")).toBeNull();
    expect(getFreeGiftOffer("G888-T4656-0016")).toBeNull();
  });

  it("keeps the base and gift together in the single picking lane", () => {
    expect(isGiftPairSkuSet(["G888-T4656-0017", "17GIFT"])).toBe(true);
    expect(isGiftPairSkuSet(["G888-T4656-0017", "17GIFT", "5"])).toBe(false);
  });
});