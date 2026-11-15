import { describe, expect, it } from "vitest";
import { getFreeGiftOffer, isGiftPairSkuSet } from "@/lib/freeGiftOffers";

describe("SKU 0017 gift", () => {
  it("gives testtaro the testwebo tape with a standard value of 19 GEL", () => {
    expect(getFreeGiftOffer("testtaro")?.giftSku).toBe("testwebo");
    expect(getFreeGiftOffer("testtaro")?.valueGel).toBe(19);
    expect(getFreeGiftOffer("testwebo")).toBeNull();
  });
  it("attaches warehouse SKU 17GIFT only to the 0017 base product", () => {
    expect(getFreeGiftOffer("G888-T4656-0017")?.giftSku).toBe("17GIFT");
    expect(getFreeGiftOffer("17GIFT")).toBeNull();
    expect(getFreeGiftOffer("G888-T4656-0016")).toBeNull();
  });

  it("keeps the base and gift together in the single picking lane", () => {
    expect(isGiftPairSkuSet(["G888-T4656-0017", "17GIFT"])).toBe(true);
    expect(isGiftPairSkuSet(["G888-T4656-0017", "17GIFT", "5"])).toBe(false);
  });

  it("gives SKU 136 the testfiber cloth with a standard value of 19 GEL", () => {
    expect(getFreeGiftOffer("136")?.giftSku).toBe("testfiber");
    expect(getFreeGiftOffer("136")?.valueGel).toBe(19);
    expect(getFreeGiftOffer("testfiber")).toBeNull();
    expect(isGiftPairSkuSet(["136", "testfiber"])).toBe(true);
  });

  it("gives testpets the testpetgift ball with a standard value of 19 GEL", () => {
    expect(getFreeGiftOffer("testpets")?.giftSku).toBe("testpetgift");
    expect(getFreeGiftOffer("testpets")?.valueGel).toBe(19);
    expect(getFreeGiftOffer("testpetgift")).toBeNull();
    expect(isGiftPairSkuSet(["testpets", "testpetgift"])).toBe(true);
  });
});