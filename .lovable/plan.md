

## Goal
Replace the 10 Shopify-hosted gallery images for **მეტალის მილების საჭრელი** with the 2 uploaded reference images (compressed to WebP), so the product detail page and landing page show only those two photos.

## What gets done

1. **Compress & host the 2 uploaded images locally**
   - Convert both uploaded JPEGs to WebP at quality ~82 (visually lossless, ~70-80% smaller).
   - Save them to `public/images/` with both full-size and `_400x` / `_800x` responsive variants (matching the existing convention used for `spy-detector-hero`, `tile-cutter-holder`).
   - File names:
     - `pipe-cutter-perfect-cut.webp` + `_400x.webp` + `_800x.webp`
     - `pipe-cutter-labor-saving.webp` + `_400x.webp` + `_800x.webp`
   - Target size: ~80–150 KB for the full-size, ~25 KB for `_400x`.

2. **Update the database row** for product id `10068777959719` (`handle: მეტალის-მილების-საჭრელი`):
   - `image` → `/images/pipe-cutter-perfect-cut.webp` (hero, used as the first slide and in product cards)
   - `images` → `["/images/pipe-cutter-perfect-cut.webp", "/images/pipe-cutter-labor-saving.webp"]`
   - Done via a Supabase migration so it's tracked and re-runnable.

3. **Protect the override from Shopify re-sync**
   - The `sync-products` edge function currently overwrites `image` and `images` from Shopify on every run, which would revert this change.
   - Add a small guard: if `products.image` starts with `/images/` (i.e. is a locally-hosted override), the sync function skips overwriting `image` and `images` for that row but still updates price, title, stock, etc.
   - This makes the local override sticky for any product, not just this one.

## Files touched

| File | Change |
|---|---|
| `public/images/pipe-cutter-perfect-cut.webp` (+ `_400x`, `_800x`) | New (generated from upload 1) |
| `public/images/pipe-cutter-labor-saving.webp` (+ `_400x`, `_800x`) | New (generated from upload 2) |
| `supabase/migrations/<timestamp>_pipe_cutter_images.sql` | New — `UPDATE products SET image=..., images='[...]'::jsonb WHERE id='10068777959719';` |
| `supabase/functions/sync-products/index.ts` | Small change: when upserting, if existing row's `image` starts with `/images/`, preserve its `image` and `images` fields. |

## Out of scope
- No changes to Shopify itself (the original 10 images stay in Shopify, just no longer referenced by the storefront).
- No edits to `ProductImageSlider` or `ProductPhotoGallery` — they already handle a 2-image gallery correctly.

