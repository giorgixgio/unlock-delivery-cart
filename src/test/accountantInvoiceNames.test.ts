import { describe, expect, it } from "vitest";
import { CUSTOMS_INVOICE_PRODUCTS, getInvoiceNamesSummary, getInvoiceProductName, resolveInvoiceProduct } from "@/lib/accountantInvoiceNames";

describe("customs invoice identity matching", () => {
  it.each([
    ["0027", "G888-T4656-0027"],
    ["0028", "G888-T4656-0028"],
    ["G888-T4656-0019", "0019"],
    ["002", "002"],
    ["G888-T4656-0012_1", "0012_1"],
    ["G888-T4656-0012_4", "0012_4"],
    ["0011", "0011"],
  ])("matches report SKU %s to invoice row %s", (reportSku, invoiceSku) => {
    expect(resolveInvoiceProduct(reportSku)?.sku).toBe(invoiceSku);
  });

  it("contains all seven invoice identities exactly once", () => {
    expect(new Set(CUSTOMS_INVOICE_PRODUCTS.map((entry) => entry.sku)).size).toBe(7);
  });

  it("matches the wholesale bottle-cutter shipping mark to its legacy invoice identity", () => {
    expect(resolveInvoiceProduct("G888-T4656-0031")?.sku).toBe("0012_1");
  });

  it("disambiguates the reused 0012 only with the verified bottle-cutter title", () => {
    expect(resolveInvoiceProduct("G888-T4656-0012", "შუშის ბოთლების საჭრელი")?.sku).toBe("0012_1");
    expect(resolveInvoiceProduct("0012", "45° ფილის საჭრელი დამჭერი კუთხსახეხისთვის — ზუსტი და სუფთა ჭრა")).toBeNull();
    expect(resolveInvoiceProduct("0012")).toBeNull();
  });

  it("never removes leading zeroes or variant suffixes to force a match", () => {
    expect(resolveInvoiceProduct("2")).toBeNull();
    expect(resolveInvoiceProduct("G888-T4656-0012_9")).toBeNull();
    expect(resolveInvoiceProduct("G888-T4656-9999")).toBeNull();
  });

  it("preserves order-line identity and unknown gaps in a mixed shipment", () => {
    expect(getInvoiceNamesSummary("002 ×2, UNKNOWN ×1, G888-T4656-0012 ×1", "Camera; Unknown; შუშის ბოთლების საჭრელი").split("; ")).toEqual([
      getInvoiceProductName("002"), "Not in import document (UNKNOWN)", getInvoiceProductName("0012_1"),
    ]);
  });
});