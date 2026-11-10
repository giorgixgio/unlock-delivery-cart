// Test-order rule, identical to the admin Test orders tab and DB public.is_test_order:
// an order is a test order when any line's SKU is a test SKU (or it carries the 'test_sku' tag).
// Keep TEST_SKUS in sync with src/lib/testProducts.ts and public.is_test_sku.
export const TEST_SKUS = ["999999", "test1", "test2", "test3", "test4", "test5", "test6", "test7", "test8", "test9", "testkrema", "testwarbi", "207"];
const SET = new Set(TEST_SKUS);

export const isTestSku = (sku?: string | null) => SET.has(String(sku ?? "").trim().toLowerCase());

export function isTestOrder(o: { tags?: string[] | null; order_items?: { sku?: string | null }[] | null }): boolean {
  return (o.tags ?? []).includes("test_sku") || (o.order_items ?? []).some((i) => isTestSku(i.sku));
}
