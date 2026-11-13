import { describe, expect, it } from "vitest";
import { getProductBenefitBadges } from "@/lib/productBenefitBadges";

describe("testpowder benefit badges", () => {
  it("shows the three drain-powder claims, in order, with distinct high-contrast tones", () => {
    const badges = getProductBenefitBadges("testpowder");
    expect(badges.map((b) => b.text)).toEqual(["შლის თმას", "აშორებს სუნს", "აშორებს ცხიმს"]);
    expect(new Set(badges.map((b) => b.tone)).size).toBe(3);
    expect(badges.every((b) => b.text.trim().length > 0)).toBe(true);
  });

  it("shows nothing for SKUs without configured claims", () => {
    expect(getProductBenefitBadges("002")).toEqual([]);
    expect(getProductBenefitBadges("testwarbi")).toEqual([]);
    expect(getProductBenefitBadges(undefined)).toEqual([]);
    expect(getProductBenefitBadges(null)).toEqual([]);
  });
});
