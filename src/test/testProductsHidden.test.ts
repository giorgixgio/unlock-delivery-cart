import { describe, it, expect } from "vitest";
import { TEST_SKUS, isTestSku, filterTestProducts } from "@/lib/testProducts";

type Row = { id: string; sku: string; title: string };

const catalog: Row[] = [
  { id: "p-disc", sku: "disc-product", title: "საპრიალო დისკი" },
  { id: "p-krema", sku: "testkrema", title: "KERAVÉ ლამელარის ზელქი" },
  { id: "p-warbi", sku: "testwarbi", title: "KERAVÉ წარბის შტამპი" },
  { id: "p-camera", sku: "002", title: "მინი კამერა" },
  { id: "p-empty", sku: "", title: "ბარკოდის გარეშე" },
];

describe("test products stay off the storefront", () => {
  it("hides the KERAVÉ test SKUs the owner named", () => {
    expect(isTestSku("testkrema")).toBe(true);
    expect(isTestSku("testwarbi")).toBe(true);
  });

  it("hides every SKU in the shared test list", () => {
    expect(TEST_SKUS).toContain("999999");
    expect(TEST_SKUS).toContain("test9");
    for (const sku of TEST_SKUS) expect(isTestSku(sku)).toBe(true);
  });

  it("keeps real catalog SKUs visible", () => {
    expect(isTestSku("disc-product")).toBe(false);
    expect(isTestSku("002")).toBe(false);
    expect(isTestSku("")).toBe(false);
    expect(isTestSku(undefined)).toBe(false);
  });

  it("drops only test rows from the homepage feed", () => {
    expect(filterTestProducts(catalog).map((p) => p.sku)).toEqual([
      "disc-product",
      "002",
      "",
    ]);
  });
});
