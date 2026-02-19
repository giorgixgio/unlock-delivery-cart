
# Fix: Products Not Showing (Stale Cache Issue)

## What's Actually Happening

The database has all 89 products with real Shopify CDN images. The hook (`useProducts`) correctly reads from the database. But there's a stale `localStorage` cache key (`bigmart-products-v3`) that was saved **before** the database migration ran — it's returning empty or zero products and blocking the fresh database fetch entirely.

The cache has a 10-minute TTL, so users who visited before the migration will keep seeing nothing until it expires naturally.

## The Fix

Two small changes to `src/hooks/useProducts.ts`:

1. **Bump the cache key** from `bigmart-products-v3` to `bigmart-products-v4` — this instantly invalidates all existing stale caches across all browsers/visitors and forces a fresh DB fetch.

2. **Remove the `shopifyThumb` double-resizing bug** — the images from `order_items` are already saved as `_400x` URLs (e.g. `...file_400x.jpg`). Running `shopifyThumb()` on them again appends `_400x` a second time, creating broken URLs like `...file_400x_400x.jpg`. Need to detect if URL already has a size suffix and skip the transform.

## Files to Change

- `src/hooks/useProducts.ts` — bump cache key + fix double-resize on already-sized image URLs

## Result

- All 89 products appear immediately on next page load
- Images display correctly (no double `_400x` in URL)
- Any future DB sync will also cache correctly
- No database changes needed — the data is already there and correct
