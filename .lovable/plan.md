# Fix category browsing on the homepage

## What's actually wrong

Verified against the live database and the code:

- **Categories are fine in the database.** 588 assignments across 18 categories, every one matches a real product (kitchen 127, accessories 74, beauty 59, uncategorized 59, ... pets 3, smoking 2). So "empty" tabs are a frontend problem, not missing data.
- **Only 20 products ever render per category.** The infinite-scroll hook resets its counter whenever the product array changes identity. The homepage rebuilds that array on every render, so the counter is pushed back to 20 continuously and scrolling never loads more. This is the "doesn't show all products" bug.
- **Category chips are guessed twice.** Besides the real assignments, the app re-derives a category from product tags/title whenever the product row's own category is `uncategorized`. That guessed value is merged in, so products land in chips they were never assigned to, and small/new categories look inconsistent.
- **Stale local cache.** Products are cached in the browser under one key; after the AI categorization runs, a visitor can keep seeing the old category data until the cache expires.

## What I'll change

1. **Fix the pagination reset** so the counter only resets on an actual category change, not on every render — all products in a category load as you scroll.
2. **Trust the database as the single source of category truth.** Use `product_categories` assignments; fall back to the product's own category only when it has no assignments at all. Drop the tag/title guessing from the storefront feed.
3. **Show counts on the chips** (e.g. "სამზარეულო 127") so it's immediately visible which tabs are genuinely small vs. broken, and hide chips with zero products.
4. **Uncategorized tab ("სხვა")** stays visible and lists every product with no real category, so you can see exactly which SKUs are unclassified and why (they'll show title + image + SKU, i.e. the inputs the classifier had).
5. **Refresh the cache** (new cache version + fetch all rows without relying on a default row cap) so live visitors immediately get current categories.

## Technical notes

- `src/hooks/useInfiniteScroll.ts`: reset on a stable key rather than array identity.
- `src/pages/Index.tsx`: memoize the filtered list, compute per-category counts, render counts on chips, keep `uncategorized` chip.
- `src/hooks/useProducts.ts`: category resolution from `product_categories` only (fallback to `products.category`), remove `categorizeByTags` from the merge path, bump cache key to v6, paginate the assignments fetch.
- No database or admin changes; checkout, cart and landing funnels untouched.
