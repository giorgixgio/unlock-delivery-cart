
## Fix: Bulletproof Out-of-Stock on Storefront

### Root Cause

The current approach applies stock overrides at the `useProducts()` hook level using `useSyncExternalStore` + `useMemo`. This works in simple cases, but fails in several real-world scenarios:

1. **Stale `extraItems` in infinite scroll** -- Products loaded via infinite scroll are stored in React state (`extraItems`). These are snapshot copies of product objects. Even when overrides change and `allProducts` updates, the already-loaded `extraItems` keep their old `available` value.

2. **React Query cache timing** -- `useMemo` depends on `[rawProducts, overrides]`. If React Query serves the same cached array reference (same object identity), `useMemo` skips recalculation even when overrides changed, because the `overrides` object from `useSyncExternalStore` might not trigger a re-render if the component unmounted and remounted (e.g., route change).

3. **Hot reload resets** -- Every code change in Lovable triggers a hot reload. Module-level `currentOverrides` reinitializes from `loadFromStorage()`, but the React Query cache may still hold stale product data from the previous session.

### Solution: Check overrides at the component level (defense in depth)

Instead of relying solely on `product.available` being correct when passed as a prop, make `ProductCard` and `HeroProductCard` directly check the override store. This is a 100% reliable approach because it reads the override at render time, regardless of how the product data was cached or passed.

### File Changes

**`src/components/ProductCard.tsx`**
- Import `getStockOverrides` from the override store
- At the top of the component, compute the real availability:
  ```
  const overrides = getStockOverrides();
  const isOOS = overrides[product.id] !== undefined 
    ? !overrides[product.id] 
    : product.available === false;
  ```
- This replaces the current `const isOOS = product.available === false;`

**`src/components/HeroProductCard.tsx`**
- Same change: import `getStockOverrides` and compute `isOOS` directly from the override store at render time
- This replaces the current `const isOOS = product.available === false;`

**`src/lib/rankingEngine.ts`**
- Import `getStockOverrides` from the override store
- In `getRelated()`, `getTrending()`, and `getWeightedRandom()`: when checking `p.available !== false`, also check the override store:
  ```
  const overrides = getStockOverrides();
  const isAvailable = (p) => {
    if (overrides[p.id] !== undefined) return overrides[p.id];
    return p.available !== false;
  };
  ```
- This ensures the ranking engine never includes OOS products in results, even if the product data passed to it has stale `available` values

### What stays the same

- The `useProducts` hook still applies overrides (for components that rely on `product.available`)
- The `stockOverrideStore` module stays unchanged
- Admin toggle logic stays unchanged
- No database changes needed

### Why this is bulletproof

Every place that checks availability now reads directly from the override store at render time. There is zero dependency on prop drilling, cache timing, or memoization. Even if every other layer fails, the components and ranking engine will always see the correct stock status.
