/**
 * Single source of truth for test/demo SKUs.
 *
 * These rows exist for testing the order pipeline and must never be sold to
 * customers: they are hidden from storefront surfaces (homepage feed, hero,
 * categories, search) while admin surfaces keep using the full catalog.
 */
export const TEST_SKUS = [
  "999999",
  "test1",
  "test2",
  "test3",
  "test4",
  "test5",
  "test6",
  "test7",
  "test8",
  "test9",
  "testkrema",
  "testwarbi",
  "207",
  "46",
  "252",
  "328/old",
  "323_x",
];

const TEST_SKU_SET = new Set(TEST_SKUS);

export function isTestSku(sku?: string | null): boolean {
  if (!sku) return false;
  return TEST_SKU_SET.has(String(sku).trim());
}

/** Drops test-SKU rows from any list that carries a `sku` field. */
export function filterTestProducts<T extends { sku?: string | null }>(products: T[]): T[] {
  return products.filter((p) => !isTestSku(p.sku));
}
