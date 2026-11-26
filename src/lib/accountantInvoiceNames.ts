/** Source: ექსელი.xlsx, customs import document supplied 2026-11-26, columns C/D.
 * Preserve leading zeroes and suffixes; never infer customs names from marketing titles.
 */
export const CUSTOMS_INVOICE_PRODUCTS = [
  { sku: "G888-T4656-0027", invoiceName: "სამზარეულოს ბოსტნეულის საფცქვნელი ხის სახელურით", aliases: [] },
  { sku: "G888-T4656-0028", invoiceName: "მობილური ტელეფონის სტიკერი", aliases: ["stikeri"] },
  { sku: "0019", invoiceName: "ავტომობილის სარეცხი საფრქვევი თავაკი", aliases: [] },
  { sku: "002", invoiceName: "ციფრული ვიდეოკამერა (ვებკამერა), უსადენო, კომპიუტერული ქსელებისა და საყოფაცხოვრებო გამოყენებისთვის", aliases: [] },
  { sku: "0012_1", invoiceName: "მინის ბოთლების საჭრელი", aliases: ["G888-T4656-0031"] },
  { sku: "0012_4", invoiceName: "კუთხსახეხი მანქანის სახეხ-საპრიალებელი დისკი", aliases: [] },
  { sku: "0011", invoiceName: "ნივთების საძიებო ბრელოკი", aliases: [] },
] as const;

function invoiceSkuKey(sku: string): string {
  return sku.trim().toUpperCase().replace(/^G888-T4656-/, "");
}

export function resolveInvoiceProduct(sku: string, websiteTitle?: string) {
  let key = invoiceSkuKey(sku);
  // Catalog 0012 is reused: bottle cutter id 10068765442343 and a tile-cutting jig.
  // Only this verified, exact bottle-cutter title disambiguates the shared SKU.
  if (key === "0012" && websiteTitle?.trim() === "შუშის ბოთლების საჭრელი") key = "0012_1";
  return CUSTOMS_INVOICE_PRODUCTS.find((entry) =>
    invoiceSkuKey(entry.sku) === key || entry.aliases.some((alias) => invoiceSkuKey(alias) === key),
  ) ?? null;
}

export function getInvoiceProductName(sku: string, websiteTitle?: string): string | null {
  return resolveInvoiceProduct(sku, websiteTitle)?.invoiceName ?? null;
}

/** SQL supplies comma-separated `SKU ×quantity` entries in line order. */
export function getInvoiceNamesSummary(skusSummary: string, titlesSummary?: string): string {
  const titles = titlesSummary?.split("; ") ?? [];
  return skusSummary.split(",").map((line, index) => {
    const sku = line.trim().replace(/\s*×\s*\d+$/, "");
    return getInvoiceProductName(sku, titles[index]) ?? `Not in import document (${sku || "UNKNOWN"})`;
  }).join("; ");
}